package handler

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	corev1 "k8s.io/api/core/v1"
	networkingv1 "k8s.io/api/networking/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/api/resource"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	kubernetes "k8s.io/client-go/kubernetes"
	"k8s.io/client-go/util/retry"

	"github.com/nightwhite/Agent-Hub/internal/agent"
	"github.com/nightwhite/Agent-Hub/internal/agenttemplate"
	"github.com/nightwhite/Agent-Hub/internal/config"
	"github.com/nightwhite/Agent-Hub/internal/dto"
	"github.com/nightwhite/Agent-Hub/internal/kube"
	"github.com/nightwhite/Agent-Hub/internal/random"
	agentws "github.com/nightwhite/Agent-Hub/internal/ws"
	appErr "github.com/nightwhite/Agent-Hub/pkg/errors"
)

func ListAgents(c *gin.Context) {
	factory, err := kubeFactory(c)
	if err != nil {
		writeHeaderKubeconfigError(c, err)
		return
	}

	ctx := c.Request.Context()
	repo, clientset, ok := newClients(c, factory)
	if !ok {
		return
	}
	cacheKey := buildAgentListCacheKey(factory, c.GetHeader(kube.DefaultAuthorizationHeader))
	if cached, ok := readCachedAgentList(cacheKey); ok {
		writeSuccess(c, http.StatusOK, cached)
		return
	}

	var (
		devboxes              *unstructured.UnstructuredList
		ingressDomainsByAgent map[string]string
		latestPodsByAgent     map[string]*corev1.Pod
		devboxErr             error
		ingressErr            error
		podErr                error
	)

	var wg sync.WaitGroup
	wg.Add(3)
	go func() {
		defer wg.Done()
		devboxes, devboxErr = repo.List(ctx, kube.ManagedListSelector())
	}()
	go func() {
		defer wg.Done()
		ingressDomainsByAgent, ingressErr = listManagedIngressDomains(ctx, clientset, factory.Namespace())
	}()
	go func() {
		defer wg.Done()
		latestPodsByAgent, podErr = listManagedLatestAgentPods(ctx, clientset, factory.Namespace())
	}()
	wg.Wait()

	if devboxErr != nil {
		writeKubernetesError(c, devboxErr, "failed to list agents")
		return
	}
	if ingressErr != nil {
		writeKubernetesError(c, ingressErr, "failed to list agent ingresses")
		return
	}
	if podErr != nil {
		log.Printf("failed to list managed pods for status enrichment: %v", podErr)
	}

	cfg := runtimeConfig(c)
	views := make([]kube.AgentView, 0, len(devboxes.Items))
	for i := range devboxes.Items {
		item := devboxes.Items[i]
		if !kube.HasManagedLabel(item.GetLabels(), item.GetName()) {
			continue
		}
		view, convErr := kube.DevboxToAgentView(&item)
		if convErr != nil {
			writeAppError(c, http.StatusInternalServerError, appErr.New(appErr.CodeKubernetesOperation, convErr.Error()))
			return
		}
		view.Agent.Status = resolveAgentRuntimeStatusFromPod(&item, latestPodsByAgent[view.Agent.Name])
		view.Agent.IngressDomain = ingressDomainsByAgent[view.Agent.Name]
		views = append(views, view)
	}
	sort.Slice(views, func(i, j int) bool { return views[i].CreatedAt > views[j].CreatedAt })

	templateCache := map[string]agenttemplate.Definition{}
	items := make([]dto.AgentContract, 0, len(views))
	for _, view := range views {
		templateID := strings.TrimSpace(view.Agent.TemplateID)
		templateDef, ok := templateCache[templateID]
		if !ok {
			var resolveErr error
			templateDef, resolveErr = resolveTemplateDefinition(cfg, templateID)
			if resolveErr != nil {
				writeAppError(c, http.StatusInternalServerError, appErr.New(appErr.CodeKubernetesOperation, resolveErr.Error()))
				return
			}
			templateCache[templateID] = templateDef
		}
		items = append(items, buildAgentContract(view, templateDef, cfg))
	}

	response := dto.AgentListResponse{
		Items: items,
		Total: len(items),
		Meta:  map[string]any{"namespace": factory.Namespace()},
	}
	writeCachedAgentList(cacheKey, response)
	writeSuccess(c, http.StatusOK, response)
}

const (
	agentListCacheTTL        = 2 * time.Second
	agentListCacheMaxEntries = 256
)

type cachedAgentList struct {
	response  dto.AgentListResponse
	expiresAt time.Time
}

var (
	agentListCacheMu sync.RWMutex
	agentListCache   = map[string]cachedAgentList{}
)

func buildAgentListCacheKey(factory *kube.Factory, authorization string) string {
	hash := sha256.Sum256([]byte(strings.TrimSpace(authorization)))
	return strings.TrimSpace(factory.ClusterServer()) + "|" + factory.Namespace() + "|" + hex.EncodeToString(hash[:])
}

func readCachedAgentList(key string) (dto.AgentListResponse, bool) {
	if strings.TrimSpace(key) == "" {
		return dto.AgentListResponse{}, false
	}

	agentListCacheMu.RLock()
	entry, ok := agentListCache[key]
	agentListCacheMu.RUnlock()
	if !ok {
		return dto.AgentListResponse{}, false
	}
	if time.Now().After(entry.expiresAt) {
		agentListCacheMu.Lock()
		currentEntry, stillExists := agentListCache[key]
		if stillExists && time.Now().After(currentEntry.expiresAt) {
			delete(agentListCache, key)
		}
		agentListCacheMu.Unlock()
		return dto.AgentListResponse{}, false
	}
	return entry.response, true
}

func writeCachedAgentList(key string, response dto.AgentListResponse) {
	if strings.TrimSpace(key) == "" {
		return
	}

	agentListCacheMu.Lock()
	now := time.Now()
	for cacheKey, entry := range agentListCache {
		if now.After(entry.expiresAt) {
			delete(agentListCache, cacheKey)
		}
	}
	if _, exists := agentListCache[key]; !exists && len(agentListCache) >= agentListCacheMaxEntries {
		oldestKey := ""
		var oldestExpiry time.Time
		for cacheKey, entry := range agentListCache {
			if oldestKey == "" || entry.expiresAt.Before(oldestExpiry) {
				oldestKey = cacheKey
				oldestExpiry = entry.expiresAt
			}
		}
		if oldestKey != "" {
			delete(agentListCache, oldestKey)
		}
	}
	agentListCache[key] = cachedAgentList{
		response:  response,
		expiresAt: now.Add(agentListCacheTTL),
	}
	agentListCacheMu.Unlock()
}

func CreateAgent(c *gin.Context) {
	factory, err := kubeFactory(c)
	if err != nil {
		writeHeaderKubeconfigError(c, err)
		return
	}

	var req dto.CreateAgentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeAppError(c, http.StatusBadRequest, appErr.ErrInvalidJSON)
		return
	}

	cfg := runtimeConfig(c)
	templateDef, templateErr := resolveTemplateDefinition(cfg, req.TemplateID)
	if templateErr != nil {
		writeAppError(c, http.StatusInternalServerError, appErr.New(appErr.CodeKubernetesOperation, templateErr.Error()))
		return
	}
	region, regionErr := requiredRegion(cfg)
	if regionErr != nil {
		writeAppError(c, http.StatusInternalServerError, regionErr)
		return
	}
	req = normalizeCreateRequestSettings(req, templateDef, cfg, region)
	if err := validateCreateRequest(req, templateDef, region); err != nil {
		writeValidationError(c, err)
		return
	}

	ctx := c.Request.Context()
	repo, clientset, ok := newClients(c, factory)
	if !ok {
		return
	}
	if _, err := repo.Get(ctx, req.AgentName); err == nil {
		writeAppError(c, http.StatusConflict, appErr.New(appErr.CodeConflict, "agent already exists"))
		return
	} else if !apierrors.IsNotFound(err) {
		writeKubernetesError(c, err, "failed to check existing agent")
		return
	}

	apiServerKey, genErr := random.String(64)
	if genErr != nil {
		writeAppError(c, http.StatusInternalServerError, appErr.New(appErr.CodeKubernetesOperation, "failed to generate api server key"))
		return
	}
	domainPrefix, genErr := random.String(12)
	if genErr != nil {
		writeAppError(c, http.StatusInternalServerError, appErr.New(appErr.CodeKubernetesOperation, "failed to generate ingress domain"))
		return
	}

	if !templateDef.BackendSupported {
		writeAppError(c, http.StatusBadRequest, appErr.New(appErr.CodeInvalidRequest, "agent template is not deployable").WithDetails(map[string]any{
			"templateId": templateDef.ID,
			"reason":     "backend_not_supported",
		}))
		return
	}
	mappedSettings, mapErr := buildTemplateSettingsUpdate(req.Settings, templateDef.Settings.Agent)
	if mapErr != nil {
		writeValidationError(c, mapErr)
		return
	}

	ingressDomain := domainPrefix + "-" + strings.TrimSpace(cfg.IngressSuffix)
	if mappedSettings.ModelProvider != nil && mappedSettings.ModelBaseURL != nil {
		modelAccess, accessErr := ensureManagedModelAccess(
			ctx,
			cfg,
			factory,
			strings.TrimSpace(c.GetHeader(kube.DefaultAuthorizationHeader)),
			strings.TrimSpace(*mappedSettings.ModelProvider),
			strings.TrimSpace(*mappedSettings.ModelBaseURL),
		)
		if accessErr != nil {
			writeAppError(c, http.StatusBadGateway, appErr.New(appErr.CodeAIProxyOperation, "failed to prepare managed model access").WithDetails(map[string]any{
				"reason": accessErr.Error(),
			}))
			return
		}
		mappedSettings.ModelProvider = stringPtr(modelAccess.Provider)
		mappedSettings.ModelBaseURL = stringPtr(modelAccess.BaseURL)
		mappedSettings.ModelAPIKey = stringPtr(modelAccess.APIKey)
	}
	ag := agent.Agent{
		Name:             strings.TrimSpace(req.AgentName),
		TemplateID:       templateDef.ID,
		AliasName:        strings.TrimSpace(req.AgentAliasName),
		Namespace:        factory.Namespace(),
		CPU:              strings.TrimSpace(req.AgentCPU),
		Memory:           strings.TrimSpace(req.AgentMemory),
		Storage:          strings.TrimSpace(req.AgentStorage),
		WorkingDir:       templateDef.WorkingDir,
		User:             templateDef.User,
		ModelProvider:    stringValue(mappedSettings.ModelProvider),
		ModelBaseURL:     stringValue(mappedSettings.ModelBaseURL),
		ModelAPIKey:      stringValue(mappedSettings.ModelAPIKey),
		Model:            stringValue(mappedSettings.Model),
		APIServerKey:     apiServerKey,
		IngressDomain:    ingressDomain,
		BootstrapPhase:   kube.BootstrapPhasePending,
		BootstrapMessage: "等待实例初始化",
		Status:           agent.StatusCreating,
	}

	objects, buildErr := kube.Build(ag, kube.BuildOptions{
		IngressDomain: ingressDomain,
		Image:         templateDef.Image,
		TemplateDir:   templateDef.ManifestPath(),
	})
	if buildErr != nil {
		writeAppError(c, http.StatusInternalServerError, appErr.New(appErr.CodeKubernetesOperation, "failed to build kubernetes resources"))
		return
	}
	applyUpdateToDevbox(objects.Devbox, mappedSettings)
	applyUpdateToService(objects.Service, mappedSettings)
	applyUpdateToIngress(objects.Ingress, mappedSettings)

	createdDevbox, kErr := repo.Create(ctx, objects.Devbox)
	if kErr != nil {
		writeKubernetesError(c, kErr, "failed to create devbox")
		return
	}
	if _, err := clientset.CoreV1().Services(factory.Namespace()).Create(ctx, objects.Service, metav1.CreateOptions{}); err != nil {
		_ = repo.Delete(ctx, createdDevbox.GetName())
		writeKubernetesError(c, err, "failed to create service")
		return
	}
	createdIngress, kErr := clientset.NetworkingV1().Ingresses(factory.Namespace()).Create(ctx, objects.Ingress, metav1.CreateOptions{})
	if kErr != nil {
		_ = clientset.CoreV1().Services(factory.Namespace()).Delete(ctx, objects.Service.Name, metav1.DeleteOptions{})
		_ = repo.Delete(ctx, createdDevbox.GetName())
		writeKubernetesError(c, kErr, "failed to create ingress")
		return
	}

	view, convErr := kube.DevboxToAgentView(createdDevbox)
	if convErr != nil {
		writeAppError(c, http.StatusInternalServerError, appErr.New(appErr.CodeKubernetesOperation, convErr.Error()))
		return
	}
	enrichAgentRuntimeStatus(ctx, clientset, createdDevbox, &view)
	view.Agent.IngressDomain = kube.IngressDomain(createdIngress)
	scheduleAgentBootstrap(factory, cfg, templateDef, view.Agent)

	writeSuccess(c, http.StatusCreated, dto.CreateAgentResponse{
		Agent: buildAgentContract(view, templateDef, cfg),
	})
}

func GetAgent(c *gin.Context) {
	factory, err := kubeFactory(c)
	if err != nil {
		writeHeaderKubeconfigError(c, err)
		return
	}
	agentName := c.Param("agentName")
	if err := validateAgentName(agentName); err != nil {
		writeValidationError(c, err)
		return
	}

	ctx := c.Request.Context()
	repo, clientset, ok := newClients(c, factory)
	if !ok {
		return
	}
	view, found := getAgentView(ctx, factory.Namespace(), agentName, repo, clientset, c)
	if !found {
		return
	}

	cfg := runtimeConfig(c)
	templateDef, resolveErr := resolveTemplateDefinition(cfg, view.Agent.TemplateID)
	if resolveErr != nil {
		writeAppError(c, http.StatusInternalServerError, appErr.New(appErr.CodeKubernetesOperation, resolveErr.Error()))
		return
	}

	writeSuccess(c, http.StatusOK, dto.AgentDetailResponse{Agent: buildAgentContract(view, templateDef, cfg)})
}

func UpdateAgent(c *gin.Context) {
	factory, err := kubeFactory(c)
	if err != nil {
		writeHeaderKubeconfigError(c, err)
		return
	}
	agentName := c.Param("agentName")
	if err := validateAgentName(agentName); err != nil {
		writeValidationError(c, err)
		return
	}

	var req dto.UpdateAgentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeAppError(c, http.StatusBadRequest, appErr.ErrInvalidJSON)
		return
	}
	if err := validateUpdateRequest(req); err != nil {
		writeValidationError(c, err)
		return
	}

	ctx := c.Request.Context()
	repo, clientset, ok := newClients(c, factory)
	if !ok {
		return
	}
	updatedDevbox, updatedIngress, updateErr := updateAgentResources(ctx, repo, clientset, factory.Namespace(), agentName, req)
	if updateErr != nil {
		writeKubernetesError(c, updateErr, "failed to update agent resources")
		return
	}

	cfg := runtimeConfig(c)
	view, convErr := kube.DevboxToAgentView(updatedDevbox)
	if convErr != nil {
		writeAppError(c, http.StatusInternalServerError, appErr.New(appErr.CodeKubernetesOperation, convErr.Error()))
		return
	}
	enrichAgentRuntimeStatus(ctx, clientset, updatedDevbox, &view)
	view.Agent.IngressDomain = kube.IngressDomain(updatedIngress)

	if shouldRebootstrap(req) {
		templateDef, templateErr := resolveTemplateDefinition(cfg, view.Agent.TemplateID)
		if templateErr != nil {
			writeAppError(c, http.StatusInternalServerError, appErr.New(appErr.CodeKubernetesOperation, templateErr.Error()))
			return
		}
		if err := markAgentBootstrapPending(ctx, repo, updatedDevbox, templateDef.ID); err != nil {
			writeKubernetesError(c, err, "failed to mark bootstrap pending")
			return
		}
		view, convErr = kube.DevboxToAgentView(updatedDevbox)
		if convErr != nil {
			writeAppError(c, http.StatusInternalServerError, appErr.New(appErr.CodeKubernetesOperation, convErr.Error()))
			return
		}
		enrichAgentRuntimeStatus(ctx, clientset, updatedDevbox, &view)
		view.Agent.IngressDomain = kube.IngressDomain(updatedIngress)
		scheduleAgentBootstrap(factory, cfg, templateDef, view.Agent)
	}

	templateDef, resolveErr := resolveTemplateDefinition(cfg, view.Agent.TemplateID)
	if resolveErr != nil {
		writeAppError(c, http.StatusInternalServerError, appErr.New(appErr.CodeKubernetesOperation, resolveErr.Error()))
		return
	}

	writeSuccess(c, http.StatusOK, dto.AgentDetailResponse{Agent: buildAgentContract(view, templateDef, cfg)})
}

func retryUpdateDevbox(ctx context.Context, repo *kube.Repository, agentName string, req dto.UpdateAgentRequest) (*unstructured.Unstructured, error) {
	var updated *unstructured.Unstructured
	err := retry.RetryOnConflict(retry.DefaultRetry, func() error {
		devbox, getErr := repo.Get(ctx, agentName)
		if getErr != nil {
			return getErr
		}
		if !kube.HasManagedLabel(devbox.GetLabels(), agentName) {
			return apierrors.NewNotFound(kube.ResourceGVR().GroupResource(), agentName)
		}

		applyUpdateToDevbox(devbox, req)
		next, updateErr := repo.Update(ctx, devbox)
		if updateErr != nil {
			return updateErr
		}
		updated = next
		return nil
	})
	return updated, err
}

func retryUpdateService(ctx context.Context, clientset kubernetes.Interface, namespace, agentName string, req dto.UpdateAgentRequest) error {
	return retry.RetryOnConflict(retry.DefaultRetry, func() error {
		service, err := clientset.CoreV1().Services(namespace).Get(ctx, agentName, metav1.GetOptions{})
		if err != nil {
			return err
		}
		applyUpdateToService(service, req)
		_, err = clientset.CoreV1().Services(namespace).Update(ctx, service, metav1.UpdateOptions{})
		return err
	})
}

func retryUpdateIngress(ctx context.Context, clientset kubernetes.Interface, namespace, agentName string, req dto.UpdateAgentRequest) (*networkingv1.Ingress, error) {
	var updated *networkingv1.Ingress
	err := retry.RetryOnConflict(retry.DefaultRetry, func() error {
		ingress, err := clientset.NetworkingV1().Ingresses(namespace).Get(ctx, agentName, metav1.GetOptions{})
		if err != nil {
			return err
		}
		applyUpdateToIngress(ingress, req)
		next, updateErr := clientset.NetworkingV1().Ingresses(namespace).Update(ctx, ingress, metav1.UpdateOptions{})
		if updateErr != nil {
			return updateErr
		}
		updated = next
		return nil
	})
	return updated, err
}

func updateAgentResources(
	ctx context.Context,
	repo *kube.Repository,
	clientset kubernetes.Interface,
	namespace string,
	agentName string,
	req dto.UpdateAgentRequest,
) (*unstructured.Unstructured, *networkingv1.Ingress, error) {
	devbox, service, _, err := getManagedResources(ctx, namespace, agentName, repo, clientset)
	if err != nil {
		return nil, nil, err
	}

	devboxSnapshot := devbox.DeepCopy()
	serviceSnapshot := service.DeepCopy()

	updatedDevbox, err := retryUpdateDevbox(ctx, repo, agentName, req)
	if err != nil {
		return nil, nil, err
	}
	if err := retryUpdateService(ctx, clientset, namespace, agentName, req); err != nil {
		return nil, nil, combineRollbackError(err, restoreDevbox(ctx, repo, devboxSnapshot))
	}

	updatedIngress, err := retryUpdateIngress(ctx, clientset, namespace, agentName, req)
	if err != nil {
		return nil, nil, combineRollbackError(
			err,
			restoreService(ctx, clientset, namespace, serviceSnapshot),
			restoreDevbox(ctx, repo, devboxSnapshot),
		)
	}

	return updatedDevbox, updatedIngress, nil
}

func restoreDevbox(ctx context.Context, repo *kube.Repository, snapshot *unstructured.Unstructured) error {
	if snapshot == nil {
		return nil
	}

	return retry.RetryOnConflict(retry.DefaultRetry, func() error {
		current, err := repo.Get(ctx, snapshot.GetName())
		if err != nil {
			return err
		}

		restore := snapshot.DeepCopy()
		restore.SetResourceVersion(current.GetResourceVersion())
		_, err = repo.Update(ctx, restore)
		return err
	})
}

func restoreService(ctx context.Context, clientset kubernetes.Interface, namespace string, snapshot *corev1.Service) error {
	if snapshot == nil {
		return nil
	}

	return retry.RetryOnConflict(retry.DefaultRetry, func() error {
		current, err := clientset.CoreV1().Services(namespace).Get(ctx, snapshot.Name, metav1.GetOptions{})
		if err != nil {
			return err
		}

		restore := snapshot.DeepCopy()
		restore.ResourceVersion = current.ResourceVersion
		_, err = clientset.CoreV1().Services(namespace).Update(ctx, restore, metav1.UpdateOptions{})
		return err
	})
}

func combineRollbackError(primary error, rollbackErrors ...error) error {
	failures := make([]string, 0, len(rollbackErrors))
	for _, err := range rollbackErrors {
		if err == nil {
			continue
		}
		failures = append(failures, err.Error())
	}
	if len(failures) == 0 {
		return primary
	}

	return fmt.Errorf("%w; rollback failed: %s", primary, strings.Join(failures, "; "))
}

func deleteManagedAgentResources(
	ctx context.Context,
	repo *kube.Repository,
	clientset kubernetes.Interface,
	namespace string,
	agentName string,
) error {
	selector := kube.ManagedSelector(agentName)
	softFailures := []string{}
	devboxMissing := false

	ingressList, err := clientset.NetworkingV1().Ingresses(namespace).List(ctx, metav1.ListOptions{LabelSelector: selector})
	if err != nil {
		softFailures = append(softFailures, fmt.Sprintf("list ingresses: %v", err))
	} else {
		for i := range ingressList.Items {
			ingress := ingressList.Items[i]
			if !kube.HasManagedLabel(ingress.GetLabels(), agentName) {
				continue
			}
			if err := clientset.NetworkingV1().Ingresses(namespace).Delete(ctx, ingress.Name, metav1.DeleteOptions{}); err != nil && !apierrors.IsNotFound(err) {
				softFailures = append(softFailures, fmt.Sprintf("delete ingress %s: %v", ingress.Name, err))
			}
		}
	}

	serviceList, err := clientset.CoreV1().Services(namespace).List(ctx, metav1.ListOptions{LabelSelector: selector})
	if err != nil {
		softFailures = append(softFailures, fmt.Sprintf("list services: %v", err))
	} else {
		for i := range serviceList.Items {
			service := serviceList.Items[i]
			if !kube.HasManagedLabel(service.GetLabels(), agentName) {
				continue
			}
			if err := clientset.CoreV1().Services(namespace).Delete(ctx, service.Name, metav1.DeleteOptions{}); err != nil && !apierrors.IsNotFound(err) {
				softFailures = append(softFailures, fmt.Sprintf("delete service %s: %v", service.Name, err))
			}
		}
	}

	devbox, err := repo.Get(ctx, agentName)
	switch {
	case err == nil:
		if kube.HasManagedLabel(devbox.GetLabels(), agentName) {
			if err := repo.Delete(ctx, devbox.GetName()); err != nil && !apierrors.IsNotFound(err) {
				return fmt.Errorf("delete devbox %s: %v", devbox.GetName(), err)
			}
		}
	case apierrors.IsNotFound(err):
		devboxMissing = true
	default:
		return fmt.Errorf("get devbox %s: %v", agentName, err)
	}

	if len(softFailures) > 0 {
		log.Printf("managed resource cleanup soft-failures for %s/%s (devboxMissing=%t): %s", namespace, agentName, devboxMissing, strings.Join(softFailures, "; "))
		if devboxMissing {
			return fmt.Errorf("managed resources cleanup failed while devbox missing: %s", strings.Join(softFailures, "; "))
		}
	}

	return nil
}

func DeleteAgent(c *gin.Context) {
	factory, err := kubeFactory(c)
	if err != nil {
		writeHeaderKubeconfigError(c, err)
		return
	}
	agentName := c.Param("agentName")
	if err := validateAgentName(agentName); err != nil {
		writeValidationError(c, err)
		return
	}

	ctx := c.Request.Context()
	repo, clientset, ok := newClients(c, factory)
	if !ok {
		return
	}
	if err := deleteManagedAgentResources(ctx, repo, clientset, factory.Namespace(), agentName); err != nil {
		writeKubernetesError(c, err, "failed to delete agent resources")
		return
	}

	writeSuccess(c, http.StatusOK, gin.H{
		"agentName": agentName,
		"deleted":   true,
	})
}

func RunAgent(c *gin.Context) {
	changeAgentState(c, "Running")
}

func PauseAgent(c *gin.Context) {
	changeAgentState(c, "Paused")
}

func GetAgentKey(c *gin.Context) {
	writeAppError(c, http.StatusNotImplemented, appErr.New(appErr.CodeNotImplemented, "agent key readback is disabled").WithDetails(map[string]any{
		"endpoint": "agent_key_read",
		"reason":   "sensitive_key_readback_disabled",
	}))
}

func RotateAgentKey(c *gin.Context) {
	factory, err := kubeFactory(c)
	if err != nil {
		writeHeaderKubeconfigError(c, err)
		return
	}
	agentName := c.Param("agentName")
	if err := validateAgentName(agentName); err != nil {
		writeValidationError(c, err)
		return
	}

	ctx := c.Request.Context()
	repo, _, ok := newClients(c, factory)
	if !ok {
		return
	}
	devbox, found := getManagedDevboxResource(ctx, factory.Namespace(), agentName, repo, c)
	if !found {
		return
	}

	newKey, genErr := random.String(64)
	if genErr != nil {
		writeAppError(c, http.StatusInternalServerError, appErr.New(appErr.CodeKubernetesOperation, "failed to generate api server key"))
		return
	}
	if err := kube.SetEnvValue(devbox, "API_SERVER_KEY", newKey); err != nil {
		writeAppError(c, http.StatusInternalServerError, appErr.New(appErr.CodeKubernetesOperation, "failed to update api server key env"))
		return
	}
	if _, err := repo.Update(ctx, devbox); err != nil {
		writeKubernetesError(c, err, "failed to rotate api server key")
		return
	}

	writeSuccess(c, http.StatusOK, dto.AgentKeyRotateResponse{AgentName: agentName, Rotated: true})
}

func ChatCompletions(c *gin.Context) {
	factory, err := kubeFactory(c)
	if err != nil {
		writeHeaderKubeconfigError(c, err)
		return
	}

	agentName := c.Param("agentName")
	if err := validateAgentName(agentName); err != nil {
		writeValidationError(c, err)
		return
	}

	ctx := c.Request.Context()
	repo, clientset, ok := newClients(c, factory)
	if !ok {
		return
	}

	view, found := getAgentView(ctx, factory.Namespace(), agentName, repo, clientset, c)
	if !found {
		return
	}

	cfg := runtimeConfig(c)
	templateDef, resolveErr := resolveTemplateDefinition(cfg, view.Agent.TemplateID)
	if resolveErr != nil {
		writeAppError(c, http.StatusInternalServerError, appErr.New(appErr.CodeKubernetesOperation, resolveErr.Error()))
		return
	}
	if !templateSupportsAccess(templateDef, "api") {
		writeAppError(c, http.StatusBadRequest, appErr.New(appErr.CodeInvalidRequest, "agent template does not support api access"))
		return
	}
	if !view.Agent.Ready {
		writeAppError(c, http.StatusConflict, appErr.New(appErr.CodeKubernetesOperation, "agent is not ready yet").WithDetails(map[string]any{
			"bootstrapPhase":   view.Agent.BootstrapPhase,
			"bootstrapMessage": view.Agent.BootstrapMessage,
		}))
		return
	}

	apiBaseURL := strings.TrimSpace(joinAccessURL(view.Agent.IngressDomain, accessPath(templateDef, "api")))
	if apiBaseURL == "" {
		writeAppError(c, http.StatusInternalServerError, appErr.New(appErr.CodeKubernetesOperation, "agent ingress domain is unavailable"))
		return
	}

	apiServerKey := strings.TrimSpace(view.Agent.APIServerKey)
	if apiServerKey == "" {
		writeAppError(c, http.StatusInternalServerError, appErr.New(appErr.CodeKubernetesOperation, "agent api server key is unavailable"))
		return
	}

	upstreamURL := strings.TrimRight(apiBaseURL, "/") + "/chat/completions"
	req, reqErr := http.NewRequestWithContext(ctx, http.MethodPost, upstreamURL, c.Request.Body)
	if reqErr != nil {
		writeAppError(c, http.StatusInternalServerError, appErr.New(appErr.CodeKubernetesOperation, "failed to build chat proxy request"))
		return
	}

	contentType := strings.TrimSpace(c.GetHeader("Content-Type"))
	if contentType == "" {
		contentType = "application/json"
	}
	req.Header.Set("Content-Type", contentType)

	accept := strings.TrimSpace(c.GetHeader("Accept"))
	if accept == "" {
		accept = "application/json, text/event-stream"
	}
	req.Header.Set("Accept", accept)
	req.Header.Set("Authorization", "Bearer "+apiServerKey)
	req.Header.Set("X-API-Key", apiServerKey)

	upstreamResp, upstreamErr := (&http.Client{}).Do(req)
	if upstreamErr != nil {
		writeAppError(c, http.StatusBadGateway, appErr.New(appErr.CodeKubernetesOperation, "failed to proxy chat request"))
		return
	}
	defer upstreamResp.Body.Close()

	if headerValue := upstreamResp.Header.Get("Content-Type"); headerValue != "" {
		c.Header("Content-Type", headerValue)
	}
	if headerValue := upstreamResp.Header.Get("Cache-Control"); headerValue != "" {
		c.Header("Cache-Control", headerValue)
	}
	if headerValue := upstreamResp.Header.Get("X-Accel-Buffering"); headerValue != "" {
		c.Header("X-Accel-Buffering", headerValue)
	} else {
		c.Header("X-Accel-Buffering", "no")
	}

	c.Status(upstreamResp.StatusCode)
	flusher, _ := c.Writer.(http.Flusher)
	buffer := make([]byte, 32*1024)

	for {
		n, readErr := upstreamResp.Body.Read(buffer)
		if n > 0 {
			if _, writeErr := c.Writer.Write(buffer[:n]); writeErr != nil {
				return
			}
			if flusher != nil {
				flusher.Flush()
			}
		}

		if readErr == nil {
			continue
		}
		if readErr == io.EOF {
			return
		}
		return
	}
}

func AgentWebSocket(c *gin.Context) {
	agentws.Handler{Config: runtimeConfig(c)}.Serve(c, requestID(c))
}

func newClients(c *gin.Context, factory *kube.Factory) (*kube.Repository, kubernetes.Interface, bool) {
	dynamicClient, err := factory.Dynamic()
	if err != nil {
		writeAppError(c, http.StatusInternalServerError, appErr.New(appErr.CodeKubernetesOperation, "failed to build kubernetes dynamic client"))
		return nil, nil, false
	}
	clientset, err := factory.Kubernetes()
	if err != nil {
		writeAppError(c, http.StatusInternalServerError, appErr.New(appErr.CodeKubernetesOperation, "failed to build kubernetes clientset"))
		return nil, nil, false
	}
	return kube.NewRepository(dynamicClient, factory.Namespace()), clientset, true
}

func getAgentView(ctx context.Context, namespace, agentName string, repo *kube.Repository, clientset kubernetes.Interface, c *gin.Context) (kube.AgentView, bool) {
	devbox, ing, found := getAgentViewResources(ctx, namespace, agentName, repo, clientset, c)
	if !found {
		return kube.AgentView{}, false
	}
	view, err := kube.DevboxToAgentView(devbox)
	if err != nil {
		writeAppError(c, http.StatusInternalServerError, appErr.New(appErr.CodeKubernetesOperation, err.Error()))
		return kube.AgentView{}, false
	}
	enrichAgentRuntimeStatus(ctx, clientset, devbox, &view)
	view.Agent.IngressDomain = kube.IngressDomain(ing)
	return view, true
}

func getAgentViewResources(ctx context.Context, namespace, agentName string, repo *kube.Repository, clientset kubernetes.Interface, c *gin.Context) (*unstructured.Unstructured, *networkingv1.Ingress, bool) {
	devbox, ing, err := getManagedAgentIngressResources(ctx, namespace, agentName, repo, clientset)
	if err == nil {
		return devbox, ing, true
	}

	switch {
	case apierrors.IsNotFound(err):
		resource := strings.TrimSpace(err.Error())
		switch {
		case strings.Contains(resource, "services"):
			writeKubernetesError(c, err, "service not found for agent")
		case strings.Contains(resource, "ingresses"):
			writeKubernetesError(c, err, "ingress not found for agent")
		default:
			writeKubernetesError(c, err, "agent not found")
		}
	default:
		writeKubernetesError(c, err, "agent not found")
	}

	return nil, nil, false
}

func getManagedDevboxResource(ctx context.Context, namespace, agentName string, repo *kube.Repository, c *gin.Context) (*unstructured.Unstructured, bool) {
	devbox, err := repo.Get(ctx, agentName)
	if err == nil {
		if kube.HasManagedLabel(devbox.GetLabels(), agentName) {
			return devbox, true
		}
		err = apierrors.NewNotFound(kube.ResourceGVR().GroupResource(), agentName)
	}

	if apierrors.IsNotFound(err) {
		writeKubernetesError(c, err, fmt.Sprintf("agent %s not found in namespace %s", agentName, namespace))
		return nil, false
	}

	writeKubernetesError(c, err, "failed to load agent devbox")
	return nil, false
}

func getManagedResources(ctx context.Context, namespace, agentName string, repo *kube.Repository, clientset kubernetes.Interface) (*unstructured.Unstructured, *corev1.Service, *networkingv1.Ingress, error) {
	devbox, err := repo.Get(ctx, agentName)
	if err != nil {
		return nil, nil, nil, err
	}
	if !kube.HasManagedLabel(devbox.GetLabels(), agentName) {
		return nil, nil, nil, apierrors.NewNotFound(kube.ResourceGVR().GroupResource(), agentName)
	}

	svc, err := clientset.CoreV1().Services(namespace).Get(ctx, agentName, metav1.GetOptions{})
	if err != nil {
		return nil, nil, nil, err
	}

	ing, err := clientset.NetworkingV1().Ingresses(namespace).Get(ctx, agentName, metav1.GetOptions{})
	if err != nil {
		return nil, nil, nil, err
	}

	return devbox, svc, ing, nil
}

func getManagedAgentIngressResources(ctx context.Context, namespace, agentName string, repo *kube.Repository, clientset kubernetes.Interface) (*unstructured.Unstructured, *networkingv1.Ingress, error) {
	devbox, err := repo.Get(ctx, agentName)
	if err != nil {
		return nil, nil, err
	}
	if !kube.HasManagedLabel(devbox.GetLabels(), agentName) {
		return nil, nil, apierrors.NewNotFound(kube.ResourceGVR().GroupResource(), agentName)
	}

	ing, err := clientset.NetworkingV1().Ingresses(namespace).Get(ctx, agentName, metav1.GetOptions{})
	if err != nil {
		return nil, nil, err
	}

	return devbox, ing, nil
}

func shouldRebootstrap(req dto.UpdateAgentRequest) bool {
	return req.Rebootstrap || req.ModelProvider != nil || req.ModelBaseURL != nil || req.Model != nil || req.ModelAPIKey != nil
}

func markAgentBootstrapPending(ctx context.Context, repo *kube.Repository, devbox *unstructured.Unstructured, templateID string) error {
	if devbox == nil {
		return fmt.Errorf("devbox is nil")
	}
	if err := updateBootstrapMetadata(devbox, templateID); err != nil {
		return err
	}
	updated, err := repo.Update(ctx, devbox)
	if err != nil {
		return err
	}
	devbox.Object = updated.Object
	return nil
}

func enrichIngressDomain(ctx context.Context, clientset kubernetes.Interface, view *kube.AgentView) {
	ing, err := clientset.NetworkingV1().Ingresses(view.Agent.Namespace).Get(ctx, view.Agent.Name, metav1.GetOptions{})
	if err == nil {
		view.Agent.IngressDomain = kube.IngressDomain(ing)
		return
	}

	log.Printf("failed to load ingress for agent %s/%s: %v", view.Agent.Namespace, view.Agent.Name, err)
}

func listManagedIngressDomains(ctx context.Context, clientset kubernetes.Interface, namespace string) (map[string]string, error) {
	ingresses, err := clientset.NetworkingV1().Ingresses(namespace).List(ctx, metav1.ListOptions{
		LabelSelector: kube.ManagedListSelector(),
	})
	if err != nil {
		return nil, err
	}

	domains := make(map[string]string, len(ingresses.Items))
	for i := range ingresses.Items {
		ing := ingresses.Items[i]
		agentName := strings.TrimSpace(ing.GetLabels()["agent.sealos.io/name"])
		if agentName == "" {
			agentName = strings.TrimSpace(ing.GetName())
		}
		if agentName == "" {
			continue
		}
		domains[agentName] = kube.IngressDomain(&ing)
	}

	return domains, nil
}

func listManagedLatestAgentPods(ctx context.Context, clientset kubernetes.Interface, namespace string) (map[string]*corev1.Pod, error) {
	managedPods, err := clientset.CoreV1().Pods(namespace).List(ctx, metav1.ListOptions{
		LabelSelector: kube.ManagedListSelector(),
	})
	if err != nil {
		return nil, err
	}

	latest := make(map[string]*corev1.Pod, len(managedPods.Items))
	managedAgents := make(map[string]bool, len(managedPods.Items))
	for i := range managedPods.Items {
		pod := managedPods.Items[i]
		agentName := strings.TrimSpace(pod.GetLabels()["agent.sealos.io/name"])
		if agentName == "" {
			continue
		}
		managedAgents[agentName] = true
		upsertLatestAgentPod(latest, pod, agentName)
	}

	legacyPods, err := clientset.CoreV1().Pods(namespace).List(ctx, metav1.ListOptions{
		LabelSelector: "agent.sealos.io/name",
	})
	if err != nil {
		return nil, err
	}

	expectedManagedBy := strings.TrimSpace(kube.ManagedByValue())
	for i := range legacyPods.Items {
		pod := legacyPods.Items[i]
		labels := pod.GetLabels()
		agentName := strings.TrimSpace(labels["agent.sealos.io/name"])
		if agentName == "" || managedAgents[agentName] {
			continue
		}
		managedBy := strings.TrimSpace(labels["agent.sealos.io/managed-by"])
		if managedBy != "" && managedBy != expectedManagedBy {
			continue
		}
		upsertLatestAgentPod(latest, pod, agentName)
	}

	return latest, nil
}

func upsertLatestAgentPod(latest map[string]*corev1.Pod, pod corev1.Pod, agentName string) {
	existing := latest[agentName]
	if existing == nil {
		latest[agentName] = pod.DeepCopy()
		return
	}
	if existing.DeletionTimestamp != nil && pod.DeletionTimestamp == nil {
		latest[agentName] = pod.DeepCopy()
		return
	}
	if existing.DeletionTimestamp == nil && pod.DeletionTimestamp != nil {
		return
	}
	if pod.CreationTimestamp.Time.After(existing.CreationTimestamp.Time) {
		latest[agentName] = pod.DeepCopy()
	}
}

func validateCreateRequest(
	req dto.CreateAgentRequest,
	templateDef agenttemplate.Definition,
	region string,
) *appErr.AppError {
	if strings.TrimSpace(req.TemplateID) == "" {
		return validationFieldError("template-id", "required", req.TemplateID)
	}
	if err := validateAgentName(req.AgentName); err != nil {
		return err
	}
	if err := validateQuantity("agent-cpu", req.AgentCPU); err != nil {
		return err
	}
	if err := validateQuantity("agent-memory", req.AgentMemory); err != nil {
		return err
	}
	if err := validateQuantity("agent-storage", req.AgentStorage); err != nil {
		return err
	}
	if req.AgentAliasName != "" && strings.TrimSpace(req.AgentAliasName) == "" {
		return validationFieldError("agent-alias-name", "cannot_be_empty", req.AgentAliasName)
	}
	return validateTemplateSettingsPayload(req.Settings, templateDef.Settings.Agent, templateDef, region, true, "settings.")
}

func validateUpdateRequest(req dto.UpdateAgentRequest) *appErr.AppError {
	if req.AgentCPU != nil {
		if err := validateQuantity("agent-cpu", *req.AgentCPU); err != nil {
			return err
		}
	}
	if req.AgentMemory != nil {
		if err := validateQuantity("agent-memory", *req.AgentMemory); err != nil {
			return err
		}
	}
	if req.AgentStorage != nil {
		if err := validateQuantity("agent-storage", *req.AgentStorage); err != nil {
			return err
		}
	}
	if req.RuntimeClassName != nil && strings.TrimSpace(*req.RuntimeClassName) == "" {
		return validationFieldError("runtime-class-name", "cannot_be_empty", *req.RuntimeClassName)
	}
	if req.ModelBaseURL != nil {
		if err := validateModelBaseURL(*req.ModelBaseURL); err != nil {
			return err
		}
	}
	if req.ModelProvider != nil && strings.TrimSpace(*req.ModelProvider) == "" {
		return validationFieldError("agent-model-provider", "cannot_be_empty", *req.ModelProvider)
	}
	if req.Model != nil && strings.TrimSpace(*req.Model) == "" {
		return validationFieldError("agent-model", "cannot_be_empty", *req.Model)
	}
	return nil
}

func validateAgentName(name string) *appErr.AppError {
	if !agent.ValidateName(strings.TrimSpace(name)) {
		return appErr.New(appErr.CodeInvalidAgentName, "invalid agent name").WithDetails(map[string]any{
			"field":  "agentName",
			"reason": "invalid_format",
			"value":  strings.TrimSpace(name),
		})
	}
	return nil
}

func validateQuantity(field, value string) *appErr.AppError {
	if strings.TrimSpace(value) == "" {
		return validationFieldError(field, "required", value)
	}
	if _, err := resource.ParseQuantity(strings.TrimSpace(value)); err != nil {
		return validationFieldError(field, "invalid_quantity", value)
	}
	return nil
}

func validateModelBaseURL(value string) *appErr.AppError {
	parsed, err := url.Parse(strings.TrimSpace(value))
	if err != nil || parsed.Scheme == "" || parsed.Host == "" {
		return validationFieldError("agent-model-baseurl", "invalid_url", value)
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return validationFieldError("agent-model-baseurl", "unsupported_scheme", value)
	}
	return nil
}

func validationFieldError(field, reason, value string) *appErr.AppError {
	message := field + " is invalid"
	switch reason {
	case "required":
		message = field + " is required"
	case "cannot_be_empty":
		message = field + " cannot be empty"
	case "invalid_quantity":
		message = field + " is invalid"
	case "invalid_url":
		message = field + " is invalid"
	case "unsupported_scheme":
		message = field + " must start with http or https"
	case "unsupported_field":
		message = field + " is not supported"
	case "read_only":
		message = field + " is read only"
	case "invalid_type":
		message = field + " has invalid type"
	}

	return appErr.New(appErr.CodeValidationFailed, message).WithDetails(map[string]any{
		"field":  field,
		"reason": reason,
		"value":  value,
	})
}

func normalizeCreateRequestSettings(
	req dto.CreateAgentRequest,
	templateDef agenttemplate.Definition,
	cfg config.Config,
	region string,
) dto.CreateAgentRequest {
	settings := map[string]any{}
	allowedSettingKeys := map[string]bool{}
	for _, field := range templateDef.Settings.Agent {
		trimmedKey := strings.TrimSpace(field.Key)
		if trimmedKey == "" {
			continue
		}
		if field.ReadOnly && strings.TrimSpace(field.Binding.Kind) == "derived" {
			continue
		}
		allowedSettingKeys[trimmedKey] = true
	}
	for key, value := range req.Settings {
		trimmedKey := strings.TrimSpace(key)
		if trimmedKey == "" {
			continue
		}
		settings[trimmedKey] = value
	}

	readSetting := func(key string) string {
		raw, ok := settings[key]
		if !ok {
			return ""
		}
		text, _ := raw.(string)
		return strings.TrimSpace(text)
	}
	setSetting := func(key, value string) {
		if !allowedSettingKeys[key] {
			return
		}
		trimmed := strings.TrimSpace(value)
		if trimmed == "" {
			return
		}
		settings[key] = trimmed
	}

	model := readSetting("model")
	if model == "" {
		model = strings.TrimSpace(stringValue(req.Model))
	}
	setSetting("model", model)

	provider := readSetting("provider")
	if provider == "" {
		provider = strings.TrimSpace(stringValue(req.ModelProvider))
	}
	if provider == "" && model != "" {
		for _, preset := range templateDef.RegionModelPresets[region] {
			if strings.TrimSpace(preset.Value) != model {
				continue
			}
			provider = strings.TrimSpace(preset.Provider)
			if provider != "" {
				break
			}
		}
	}
	setSetting("provider", provider)

	baseURL := readSetting("baseURL")
	if baseURL == "" {
		baseURL = strings.TrimSpace(stringValue(req.ModelBaseURL))
	}
	if baseURL == "" && strings.TrimSpace(cfg.AIProxyModelBaseURL) != "" {
		baseURL = strings.TrimSpace(cfg.AIProxyModelBaseURL)
	}
	setSetting("baseURL", baseURL)

	req.Settings = settings
	return req
}

func applyUpdateToDevbox(devbox *unstructured.Unstructured, req dto.UpdateAgentRequest) {
	if req.AgentCPU != nil {
		_ = unstructured.SetNestedField(devbox.Object, strings.TrimSpace(*req.AgentCPU), "spec", "resource", "cpu")
	}
	if req.AgentMemory != nil {
		_ = unstructured.SetNestedField(devbox.Object, strings.TrimSpace(*req.AgentMemory), "spec", "resource", "memory")
	}
	if req.AgentStorage != nil {
		_ = unstructured.SetNestedField(devbox.Object, strings.TrimSpace(*req.AgentStorage), "spec", "storageLimit")
	}
	if req.RuntimeClassName != nil {
		_ = unstructured.SetNestedField(devbox.Object, strings.TrimSpace(*req.RuntimeClassName), "spec", "runtimeClassName")
	}
	if req.AgentAliasName != nil {
		_ = kube.SetAgentAlias(devbox, strings.TrimSpace(*req.AgentAliasName))
	}
	if req.ModelProvider != nil {
		modelProvider := strings.TrimSpace(*req.ModelProvider)
		_ = kube.SetModelProvider(devbox, modelProvider)
		_ = kube.SetEnvValue(devbox, "AGENT_MODEL_PROVIDER", modelProvider)
	}
	if req.ModelBaseURL != nil {
		modelBaseURL := normalizeUpdatedModelBaseURL(
			strings.TrimSpace(*req.ModelBaseURL),
			strings.TrimSpace(devbox.GetAnnotations()["agent.sealos.io/model-provider"]),
			req.ModelProvider,
		)
		_ = kube.SetModelBaseURL(devbox, modelBaseURL)
		_ = kube.SetEnvValue(devbox, "AGENT_MODEL_BASEURL", modelBaseURL)
	}
	if req.Model != nil {
		_ = kube.SetModelName(devbox, strings.TrimSpace(*req.Model))
		_ = kube.SetEnvValue(devbox, "AGENT_MODEL", strings.TrimSpace(*req.Model))
	}
	if req.ModelAPIKey != nil {
		_ = kube.SetEnvValue(devbox, "AGENT_MODEL_APIKEY", strings.TrimSpace(*req.ModelAPIKey))
	}
	for key, value := range req.AnnotationValues {
		if value == nil {
			continue
		}
		_ = kube.SetAnnotation(devbox, strings.TrimSpace(key), strings.TrimSpace(*value))
	}
	for key, value := range req.EnvValues {
		if value == nil {
			continue
		}
		_ = kube.SetEnvValue(devbox, strings.TrimSpace(key), strings.TrimSpace(*value))
	}

	syncDevboxModelAccessEnv(devbox)
}

func syncDevboxModelAccessEnv(devbox *unstructured.Unstructured) {
	modelProvider := strings.TrimSpace(devbox.GetAnnotations()["agent.sealos.io/model-provider"])
	if modelProvider == "" {
		modelProvider = readDevboxEnvValue(devbox, "AGENT_MODEL_PROVIDER")
	}

	modelBaseURL := readDevboxEnvValue(devbox, "AGENT_MODEL_BASEURL")
	if modelBaseURL == "" {
		modelBaseURL = strings.TrimSpace(devbox.GetAnnotations()["agent.sealos.io/model-baseurl"])
	}

	apiKey := readDevboxEnvValue(devbox, "AGENT_MODEL_APIKEY")
	hermesProvider := normalizeHermesProvider(modelProvider)
	_ = kube.SetEnvValue(devbox, "HERMES_INFERENCE_PROVIDER", hermesProvider)

	if isAIProxyHermesProvider(hermesProvider) {
		_ = kube.SetEnvValue(devbox, "OPENAI_BASE_URL", "")
		_ = kube.SetEnvValue(devbox, "OPENAI_API_KEY", "")
		_ = kube.SetEnvValue(devbox, "AIPROXY_API_KEY", apiKey)
		return
	}

	_ = kube.SetEnvValue(devbox, "OPENAI_BASE_URL", modelBaseURL)
	_ = kube.SetEnvValue(devbox, "OPENAI_API_KEY", apiKey)
	_ = kube.SetEnvValue(devbox, "AIPROXY_API_KEY", "")
}

func readDevboxEnvValue(devbox *unstructured.Unstructured, name string) string {
	envs, found, _ := unstructured.NestedSlice(devbox.Object, "spec", "config", "env")
	if !found {
		return ""
	}

	for _, item := range envs {
		entry, ok := item.(map[string]any)
		if !ok {
			continue
		}
		if strings.TrimSpace(fmt.Sprint(entry["name"])) != name {
			continue
		}
		return strings.TrimSpace(fmt.Sprint(entry["value"]))
	}

	return ""
}

func applyUpdateToService(service *corev1.Service, req dto.UpdateAgentRequest) {
	if service.Annotations == nil {
		service.Annotations = map[string]string{}
	}
	if req.AgentAliasName != nil {
		alias := strings.TrimSpace(*req.AgentAliasName)
		if alias == "" {
			delete(service.Annotations, "agent.sealos.io/alias-name")
		} else {
			service.Annotations["agent.sealos.io/alias-name"] = alias
		}
	}
	if req.ModelProvider != nil {
		service.Annotations["agent.sealos.io/model-provider"] = strings.TrimSpace(*req.ModelProvider)
	}
	if req.ModelBaseURL != nil {
		service.Annotations["agent.sealos.io/model-baseurl"] = normalizeUpdatedModelBaseURL(
			strings.TrimSpace(*req.ModelBaseURL),
			strings.TrimSpace(service.Annotations["agent.sealos.io/model-provider"]),
			req.ModelProvider,
		)
	}
	if req.Model != nil {
		service.Annotations["agent.sealos.io/model"] = strings.TrimSpace(*req.Model)
	}
	for key, value := range req.AnnotationValues {
		if value == nil {
			continue
		}
		trimmedKey := strings.TrimSpace(key)
		trimmedValue := strings.TrimSpace(*value)
		if trimmedValue == "" {
			delete(service.Annotations, trimmedKey)
			continue
		}
		service.Annotations[trimmedKey] = trimmedValue
	}
}

func applyUpdateToIngress(ingress *networkingv1.Ingress, req dto.UpdateAgentRequest) {
	if ingress.Annotations == nil {
		ingress.Annotations = map[string]string{}
	}
	if req.AgentAliasName != nil {
		alias := strings.TrimSpace(*req.AgentAliasName)
		if alias == "" {
			delete(ingress.Annotations, "agent.sealos.io/alias-name")
		} else {
			ingress.Annotations["agent.sealos.io/alias-name"] = alias
		}
	}
	if req.ModelProvider != nil {
		ingress.Annotations["agent.sealos.io/model-provider"] = strings.TrimSpace(*req.ModelProvider)
	}
	if req.ModelBaseURL != nil {
		ingress.Annotations["agent.sealos.io/model-baseurl"] = normalizeUpdatedModelBaseURL(
			strings.TrimSpace(*req.ModelBaseURL),
			strings.TrimSpace(ingress.Annotations["agent.sealos.io/model-provider"]),
			req.ModelProvider,
		)
	}
	if req.Model != nil {
		ingress.Annotations["agent.sealos.io/model"] = strings.TrimSpace(*req.Model)
	}
	for key, value := range req.AnnotationValues {
		if value == nil {
			continue
		}
		trimmedKey := strings.TrimSpace(key)
		trimmedValue := strings.TrimSpace(*value)
		if trimmedValue == "" {
			delete(ingress.Annotations, trimmedKey)
			continue
		}
		ingress.Annotations[trimmedKey] = trimmedValue
	}
}

func normalizeUpdatedModelBaseURL(value, currentProvider string, requestedProvider *string) string {
	modelBaseURL := strings.TrimSpace(value)
	provider := strings.TrimSpace(currentProvider)
	if requestedProvider != nil {
		provider = strings.TrimSpace(*requestedProvider)
	}

	if isAIProxyHermesProvider(provider) {
		return resolveAIProxyProviderBaseURL(modelBaseURL, "", provider)
	}

	if strings.EqualFold(provider, "custom") {
		return normalizeAIProxyModelBaseURL(modelBaseURL)
	}

	return modelBaseURL
}

func changeAgentState(c *gin.Context, targetState string) {
	factory, err := kubeFactory(c)
	if err != nil {
		writeHeaderKubeconfigError(c, err)
		return
	}
	if targetState != string(agent.StatusRunning) && targetState != string(agent.StatusPaused) {
		writeAppError(c, http.StatusBadRequest, appErr.New(appErr.CodeInvalidAgentState, "invalid agent state").WithDetails(map[string]any{
			"field":  "state",
			"reason": "unsupported_state",
			"value":  targetState,
		}))
		return
	}
	agentName := c.Param("agentName")
	if err := validateAgentName(agentName); err != nil {
		writeValidationError(c, err)
		return
	}

	ctx := c.Request.Context()
	repo, clientset, ok := newClients(c, factory)
	if !ok {
		return
	}
	devbox, found := getManagedDevboxResource(ctx, factory.Namespace(), agentName, repo, c)
	if !found {
		return
	}
	if err := unstructured.SetNestedField(devbox.Object, targetState, "spec", "state"); err != nil {
		writeAppError(c, http.StatusInternalServerError, appErr.New(appErr.CodeKubernetesOperation, "failed to set agent state"))
		return
	}
	updated, kErr := repo.Update(ctx, devbox)
	if kErr != nil {
		writeKubernetesError(c, kErr, "failed to update agent state")
		return
	}
	view, convErr := kube.DevboxToAgentView(updated)
	if convErr != nil {
		writeAppError(c, http.StatusInternalServerError, appErr.New(appErr.CodeKubernetesOperation, convErr.Error()))
		return
	}
	enrichAgentRuntimeStatus(ctx, clientset, updated, &view)
	enrichIngressDomain(ctx, clientset, &view)
	cfg := runtimeConfig(c)
	templateDef, resolveErr := resolveTemplateDefinition(cfg, view.Agent.TemplateID)
	if resolveErr != nil {
		writeAppError(c, http.StatusInternalServerError, appErr.New(appErr.CodeKubernetesOperation, resolveErr.Error()))
		return
	}

	writeSuccess(c, http.StatusOK, dto.AgentDetailResponse{Agent: buildAgentContract(view, templateDef, cfg)})
}
