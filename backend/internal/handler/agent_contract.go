package handler

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net"
	"strings"
	"sync"
	"time"

	"github.com/nightwhite/Agent-Hub/internal/agent"
	"github.com/nightwhite/Agent-Hub/internal/agenttemplate"
	"github.com/nightwhite/Agent-Hub/internal/config"
	"github.com/nightwhite/Agent-Hub/internal/dto"
	"github.com/nightwhite/Agent-Hub/internal/kube"
	appErr "github.com/nightwhite/Agent-Hub/pkg/errors"
)

const (
	sshAccessTokenTTL          = 1 * time.Hour
	templateDefinitionCacheTTL = 5 * time.Minute
)

var templateDefinitionCache sync.Map

type cachedTemplateDefinition struct {
	definition agenttemplate.Definition
	expiresAt  time.Time
}

func resolveTemplateDefinition(cfg config.Config, templateID string) (agenttemplate.Definition, error) {
	templateID = strings.TrimSpace(templateID)
	if templateID == "" {
		return agenttemplate.Definition{}, fmt.Errorf("template id is required")
	}

	source := templateSourceFromConfig(cfg)
	cacheKey := strings.TrimSpace(cfg.AgentTemplateGitHubURL) + "::" + strings.TrimSpace(cfg.AgentTemplateDir) + "::" + templateID
	if cached, ok := templateDefinitionCache.Load(cacheKey); ok {
		if entry, typed := cached.(cachedTemplateDefinition); typed {
			if time.Now().Before(entry.expiresAt) {
				return entry.definition, nil
			}
			templateDefinitionCache.Delete(cacheKey)
		}
	}

	definition, err := agenttemplate.ResolveFromSource(templateID, source)
	if err != nil {
		return agenttemplate.Definition{}, err
	}
	templateDefinitionCache.Store(cacheKey, cachedTemplateDefinition{
		definition: definition,
		expiresAt:  time.Now().Add(templateDefinitionCacheTTL),
	})
	return definition, nil
}

func templateSourceFromConfig(cfg config.Config) agenttemplate.Source {
	return agenttemplate.Source{
		Dir:         cfg.AgentTemplateDir,
		GitHubURL:   cfg.AgentTemplateGitHubURL,
		GitHubToken: cfg.AgentTemplateGitHubToken,
		CacheDir:    cfg.AgentTemplateCacheDir,
	}
}

func buildAgentContract(view kube.AgentView, templateDef agenttemplate.Definition, cfg config.Config) (dto.AgentContract, *appErr.AppError) {
	region := strings.TrimSpace(cfg.Region)
	accessItems := buildAgentAccessItems(view.Agent, templateDef, cfg)
	actionItems := buildAgentActions(view.Agent, templateDef, accessItems)
	modelSlots, err := modelSlotsFromAnnotations(view.Agent.Annotations)
	if err != nil {
		return dto.AgentContract{}, err
	}

	return dto.AgentContract{
		Core: dto.AgentCoreContract{
			Name:             view.Agent.Name,
			AliasName:        view.Agent.AliasName,
			TemplateID:       view.Agent.TemplateID,
			Namespace:        view.Agent.Namespace,
			Status:           string(view.Agent.Status),
			StatusText:       string(view.Agent.Status),
			Ready:            view.Agent.Ready,
			BootstrapPhase:   view.Agent.BootstrapPhase,
			BootstrapMessage: view.Agent.BootstrapMessage,
			CreatedAt:        view.CreatedAt,
		},
		Workspaces: buildAgentWorkspaces(view.Agent, templateDef, accessItems, actionItems),
		Access:     accessItems,
		Runtime: dto.AgentRuntimeContract{
			CPU:              view.Agent.CPU,
			Memory:           view.Agent.Memory,
			Storage:          view.Agent.Storage,
			RuntimeClassName: view.Agent.RuntimeClassName,
			WorkingDir:       view.Agent.WorkingDir,
			User:             view.Agent.User,
			NetworkType:      view.Agent.NetworkType,
			SSHPort:          view.Agent.SSHPort,
			ModelProvider:    view.Agent.ModelProvider,
			ModelBaseURL:     view.Agent.ModelBaseURL,
			Model:            view.Agent.Model,
			ModelAPIMode:     view.Agent.ModelAPIMode,
			ModelSlots:       modelSlots,
			HasModelAPIKey:   strings.TrimSpace(view.Agent.ModelAPIKey) != "",
		},
		Settings: dto.AgentSettingsContract{
			Runtime: toSettingFields(templateDef.Settings.Runtime, templateDef, region, buildSettingValues(view.Agent, templateDef.Settings.Runtime)),
			Agent:   toSettingFields(templateDef.Settings.Agent, templateDef, region, buildSettingValues(view.Agent, templateDef.Settings.Agent)),
		},
		Actions: actionItems,
	}, nil
}

func buildAgentContractWithConfigError(view kube.AgentView, templateDef agenttemplate.Definition, cfg config.Config, configErr *appErr.AppError) dto.AgentContract {
	region := strings.TrimSpace(cfg.Region)
	accessItems := buildAgentAccessItems(view.Agent, templateDef, cfg)
	actionItems := buildAgentActions(view.Agent, templateDef, accessItems)
	message := strings.TrimSpace(configErr.Error())
	if message == "" {
		message = "agent configuration is invalid"
	}

	return dto.AgentContract{
		Core: dto.AgentCoreContract{
			Name:             view.Agent.Name,
			AliasName:        view.Agent.AliasName,
			TemplateID:       view.Agent.TemplateID,
			Namespace:        view.Agent.Namespace,
			Status:           "Error",
			StatusText:       "config_error",
			Ready:            false,
			BootstrapPhase:   view.Agent.BootstrapPhase,
			BootstrapMessage: message,
			ConfigError:      message,
			CreatedAt:        view.CreatedAt,
		},
		Workspaces: buildAgentWorkspaces(view.Agent, templateDef, accessItems, actionItems),
		Access:     accessItems,
		Runtime: dto.AgentRuntimeContract{
			CPU:              view.Agent.CPU,
			Memory:           view.Agent.Memory,
			Storage:          view.Agent.Storage,
			RuntimeClassName: view.Agent.RuntimeClassName,
			WorkingDir:       view.Agent.WorkingDir,
			User:             view.Agent.User,
			NetworkType:      view.Agent.NetworkType,
			SSHPort:          view.Agent.SSHPort,
			ModelProvider:    view.Agent.ModelProvider,
			ModelBaseURL:     view.Agent.ModelBaseURL,
			Model:            view.Agent.Model,
			ModelAPIMode:     view.Agent.ModelAPIMode,
			HasModelAPIKey:   strings.TrimSpace(view.Agent.ModelAPIKey) != "",
		},
		Settings: dto.AgentSettingsContract{
			Runtime: toSettingFields(templateDef.Settings.Runtime, templateDef, region, buildSettingValues(view.Agent, templateDef.Settings.Runtime)),
			Agent:   toSettingFields(templateDef.Settings.Agent, templateDef, region, buildSettingValues(view.Agent, templateDef.Settings.Agent)),
		},
		Actions: actionItems,
	}
}

func modelSlotsFromAnnotations(annotations map[string]string) (map[string]dto.ModelSlotSelection, *appErr.AppError) {
	value := strings.TrimSpace(annotations["agent.sealos.io/model-slots"])
	modelSlots, err := decodeModelSlotsAnnotation(value)
	if err != nil {
		return nil, appErr.New(appErr.CodeKubernetesOperation, "invalid model slots annotation").WithDetails(map[string]any{
			"field":  "agent.sealos.io/model-slots",
			"reason": modelSlotsAnnotationErrorReason(err),
			"value":  value,
		})
	}
	return modelSlots, nil
}

func modelSlotsAnnotationErrorReason(err error) string {
	if _, ok := err.(*json.SyntaxError); ok {
		return "invalid_json"
	}
	return "invalid_slot"
}

func buildAgentAccessItems(spec agent.Agent, templateDef agenttemplate.Definition, cfg config.Config) []dto.AgentAccessItem {
	result := make([]dto.AgentAccessItem, 0, len(templateDef.Access))
	for _, item := range templateDef.Access {
		result = append(result, resolveAgentAccessItem(spec, templateDef, item, cfg))
	}
	return result
}

func resolveAgentAccessItem(
	spec agent.Agent,
	templateDef agenttemplate.Definition,
	item agenttemplate.AccessDefinition,
	cfg config.Config,
) dto.AgentAccessItem {
	entry := dto.AgentAccessItem{
		Key:        item.Key,
		Label:      item.Label,
		Status:     "disabled",
		Enabled:    false,
		Reason:     "entry_unavailable",
		WorkingDir: spec.WorkingDir,
		Modes:      append([]string(nil), item.Modes...),
	}

	if !isRuntimeAccessAllowed(spec) {
		entry.Status = runtimeAccessStatus(spec)
		entry.Reason = runtimeAccessReason(spec)
		switch item.Key {
		case "api", "web-ui":
			entry.URL = joinAccessURL(spec.IngressDomain, item.Path)
			entry.Auth = item.Auth
		case "files":
			entry.RootPath = firstNonEmpty(item.RootPath, spec.WorkingDir)
		case "ssh", "ide":
			entry.Host = strings.TrimSpace(cfg.SSHDomain)
			entry.Port = spec.SSHPort
			entry.UserName = firstNonEmpty(spec.User, templateDef.User)
		}
		return entry
	}

	switch item.Key {
	case "api":
		entry.Auth = item.Auth
		if domainErr := validateAgentIngressDomain(spec.IngressDomain, cfg.IngressSuffix); domainErr != nil {
			entry.Reason = "ingress_domain_invalid"
			return entry
		}
		entry.URL = joinAccessURL(spec.IngressDomain, item.Path)
		if entry.URL == "" {
			entry.Reason = "api_url_unavailable"
			return entry
		}
		entry.Enabled = spec.Ready
		entry.Status = accessStatus(spec.Ready)
		if spec.Ready {
			entry.Reason = ""
		} else {
			entry.Reason = bootstrapReason(spec)
		}
		return entry
	case "terminal":
		entry.Enabled = spec.Ready
		entry.Status = accessStatus(spec.Ready)
		if spec.Ready {
			entry.Reason = ""
		} else {
			entry.Reason = bootstrapReason(spec)
		}
		return entry
	case "files":
		entry.RootPath = firstNonEmpty(item.RootPath, spec.WorkingDir)
		entry.Enabled = spec.Ready
		entry.Status = accessStatus(spec.Ready)
		if spec.Ready {
			entry.Reason = ""
		} else {
			entry.Reason = bootstrapReason(spec)
		}
		return entry
	case "ssh":
		entry.Host = strings.TrimSpace(cfg.SSHDomain)
		entry.Port = spec.SSHPort
		entry.UserName = firstNonEmpty(spec.User, templateDef.User)
		if entry.Host == "" {
			entry.Reason = "ssh_domain_missing"
			return entry
		}
		if entry.Port <= 0 {
			entry.Reason = "ssh_port_unavailable"
			return entry
		}
		entry.Enabled = spec.Ready
		entry.Status = accessStatus(spec.Ready)
		if spec.Ready {
			entry.Reason = ""
		} else {
			entry.Reason = bootstrapReason(spec)
		}
		return entry
	case "ide":
		ssh := resolveAgentAccessItem(spec, templateDef, agenttemplate.AccessDefinition{Key: "ssh", Label: "SSH"}, cfg)
		entry.Host = ssh.Host
		entry.Port = ssh.Port
		entry.UserName = ssh.UserName
		entry.Enabled = ssh.Enabled
		entry.Status = ssh.Status
		entry.Reason = ssh.Reason
		return entry
	case "web-ui":
		if domainErr := validateAgentIngressDomain(spec.IngressDomain, cfg.IngressSuffix); domainErr != nil {
			entry.Reason = "ingress_domain_invalid"
			return entry
		}
		entry.URL = joinAccessURL(spec.IngressDomain, item.Path)
		if entry.URL == "" {
			entry.Reason = "web_ui_url_unavailable"
			return entry
		}
		entry.Enabled = spec.Ready
		entry.Status = accessStatus(spec.Ready)
		if spec.Ready {
			entry.Reason = ""
		} else {
			entry.Reason = bootstrapReason(spec)
		}
		return entry
	default:
		entry.Reason = "unknown_entry_type"
		return entry
	}
}

func buildAgentActions(spec agent.Agent, templateDef agenttemplate.Definition, accessItems []dto.AgentAccessItem) []dto.AgentActionItem {
	accessIndex := make(map[string]dto.AgentAccessItem, len(accessItems))
	for _, item := range accessItems {
		accessIndex[item.Key] = item
	}

	result := make([]dto.AgentActionItem, 0, len(templateDef.Actions))
	for _, item := range templateDef.Actions {
		action := dto.AgentActionItem{
			Key:   item.Key,
			Label: item.Label,
		}
		switch item.Key {
		case "open-chat":
			api := accessIndex["api"]
			action.Enabled = api.Enabled
			action.Reason = api.Reason
		case "open-terminal":
			terminal := accessIndex["terminal"]
			action.Enabled = terminal.Enabled
			action.Reason = terminal.Reason
		case "open-files":
			files := accessIndex["files"]
			action.Enabled = files.Enabled
			action.Reason = files.Reason
		case "open-settings":
			action.Enabled = true
		case "run":
			action.Enabled = spec.Status == agent.StatusPaused
			if !action.Enabled {
				action.Reason = "not_startable"
			}
		case "pause":
			action.Enabled = spec.Status == agent.StatusRunning
			if !action.Enabled {
				action.Reason = "not_pausable"
			}
		case "delete":
			action.Enabled = true
		default:
			action.Enabled = false
			action.Reason = "action_unimplemented"
		}
		if action.Enabled {
			action.Reason = ""
		}
		result = append(result, action)
	}
	return result
}

func buildAgentWorkspaces(
	spec agent.Agent,
	templateDef agenttemplate.Definition,
	accessItems []dto.AgentAccessItem,
	actionItems []dto.AgentActionItem,
) []dto.AgentWorkspaceItem {
	accessIndex := make(map[string]dto.AgentAccessItem, len(accessItems))
	for _, item := range accessItems {
		accessIndex[item.Key] = item
	}
	actionIndex := make(map[string]dto.AgentActionItem, len(actionItems))
	for _, item := range actionItems {
		actionIndex[item.Key] = item
	}

	result := make([]dto.AgentWorkspaceItem, 0, len(templateDef.Workspaces))
	for _, workspace := range templateDef.Workspaces {
		entry := dto.AgentWorkspaceItem{
			Key:     workspace.Key,
			Label:   workspace.Label,
			Enabled: true,
		}

		switch workspace.Key {
		case "overview":
			entry.Enabled = true
		case "chat":
			action := actionIndex["open-chat"]
			entry.Enabled = action.Enabled
			entry.Reason = action.Reason
		case "terminal":
			access := accessIndex["terminal"]
			entry.Enabled = access.Enabled
			entry.Reason = access.Reason
		case "files":
			access := accessIndex["files"]
			entry.Enabled = access.Enabled
			entry.Reason = access.Reason
		case "settings":
			action := actionIndex["open-settings"]
			entry.Enabled = action.Enabled
			entry.Reason = action.Reason
		case "web-ui":
			access := accessIndex["web-ui"]
			entry.Enabled = access.Enabled
			entry.Reason = access.Reason
			entry.URL = access.URL
		default:
			entry.Enabled = false
			entry.Reason = "workspace_unavailable"
		}

		if entry.Enabled {
			entry.Reason = ""
		}
		result = append(result, entry)
	}

	return result
}

func buildSettingValues(spec agent.Agent, fields []agenttemplate.SettingField) map[string]any {
	values := make(map[string]any, len(fields))
	for _, field := range fields {
		values[field.Key] = resolveSettingValue(spec, field)
	}
	return values
}

func resolveSettingValue(spec agent.Agent, field agenttemplate.SettingField) any {
	switch strings.TrimSpace(field.Binding.Kind) {
	case "runtime":
		switch strings.TrimSpace(field.Binding.Key) {
		case "cpu":
			return spec.CPU
		case "memory":
			return spec.Memory
		case "storage":
			return spec.Storage
		case "runtimeClassName":
			return spec.RuntimeClassName
		case "workingDir":
			return spec.WorkingDir
		case "user":
			return spec.User
		}
	case "agent", "derived":
		switch strings.TrimSpace(field.Binding.Key) {
		case "modelProvider":
			return spec.ModelProvider
		case "model":
			return spec.Model
		case "modelBaseURL":
			return spec.ModelBaseURL
		case "keySource":
			return keySource(spec)
		}
	case "annotation":
		return strings.TrimSpace(spec.Annotations[field.Binding.Name])
	case "env":
		return strings.TrimSpace(spec.Env[field.Binding.Name])
	}
	return nil
}

func keySource(spec agent.Agent) string {
	if strings.TrimSpace(spec.ModelAPIKey) == "" {
		return "unset"
	}
	if isAIProxyHermesProvider(spec.ModelProvider) {
		return "workspace-aiproxy"
	}
	return "custom"
}

func accessStatus(ready bool) string {
	if ready {
		return "ready"
	}
	return "pending"
}

func isRuntimeAccessAllowed(spec agent.Agent) bool {
	return (spec.Status == "" || spec.Status == agent.StatusRunning) && spec.Ready
}

func runtimeAccessStatus(spec agent.Agent) string {
	if spec.Status == agent.StatusPaused {
		return "paused"
	}
	return accessStatus(spec.Ready)
}

func runtimeAccessReason(spec agent.Agent) string {
	if spec.Status == agent.StatusPaused {
		return "agent_paused"
	}
	return bootstrapReason(spec)
}

func bootstrapReason(spec agent.Agent) string {
	if strings.TrimSpace(spec.BootstrapMessage) != "" {
		return spec.BootstrapMessage
	}
	return "bootstrap_not_ready"
}

func joinAccessURL(host, path string) string {
	host = strings.TrimSpace(host)
	if host == "" {
		return ""
	}
	normalizedPath := strings.TrimSpace(path)
	if normalizedPath == "" {
		normalizedPath = "/"
	}
	if !strings.HasPrefix(normalizedPath, "/") {
		normalizedPath = "/" + normalizedPath
	}
	return "https://" + host + normalizedPath
}

func validateAgentIngressDomain(host, ingressSuffix string) *appErr.AppError {
	normalizedHost := strings.ToLower(strings.TrimSuffix(strings.TrimSpace(host), "."))
	normalizedSuffix := strings.ToLower(strings.TrimSuffix(strings.TrimSpace(ingressSuffix), "."))
	if normalizedHost == "" || normalizedSuffix == "" {
		return appErr.New(appErr.CodeKubernetesOperation, "agent ingress domain is unavailable")
	}
	if !isDNSSubdomain(normalizedHost) || !isDNSSubdomain(normalizedSuffix) {
		return appErr.New(appErr.CodeKubernetesOperation, "agent ingress domain is invalid")
	}
	if ip := net.ParseIP(normalizedHost); ip != nil {
		return appErr.New(appErr.CodeKubernetesOperation, "agent ingress domain is invalid")
	}
	if normalizedHost != normalizedSuffix && strings.HasSuffix(normalizedHost, "."+normalizedSuffix) {
		return nil
	}
	return appErr.New(appErr.CodeKubernetesOperation, "agent ingress domain does not match configured suffix").WithDetails(map[string]any{
		"host":   normalizedHost,
		"suffix": normalizedSuffix,
	})
}

func isDNSSubdomain(value string) bool {
	if value == "" || len(value) > 253 {
		return false
	}
	for _, label := range strings.Split(value, ".") {
		if !agent.ValidateName(label) {
			return false
		}
	}
	return true
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}

func templateSupportsAccess(definition agenttemplate.Definition, key string) bool {
	_, ok := findTemplateAccess(definition, key)
	return ok
}

func accessPath(definition agenttemplate.Definition, key string) string {
	item, ok := findTemplateAccess(definition, key)
	if !ok {
		return ""
	}
	return item.Path
}

func findTemplateAccess(definition agenttemplate.Definition, key string) (agenttemplate.AccessDefinition, bool) {
	for _, item := range definition.Access {
		if strings.EqualFold(strings.TrimSpace(item.Key), strings.TrimSpace(key)) {
			return item, true
		}
	}
	return agenttemplate.AccessDefinition{}, false
}

func generateSSHAccessToken(namespace, agentName string, secret []byte, now time.Time) (string, error) {
	headerJSON, err := json.Marshal(map[string]string{
		"alg": "HS256",
		"typ": "JWT",
	})
	if err != nil {
		return "", err
	}
	payloadJSON, err := json.Marshal(map[string]any{
		"namespace":  namespace,
		"devboxName": agentName,
		"iat":        now.Unix(),
		"exp":        now.Add(sshAccessTokenTTL).Unix(),
	})
	if err != nil {
		return "", err
	}

	unsigned := base64.RawURLEncoding.EncodeToString(headerJSON) + "." + base64.RawURLEncoding.EncodeToString(payloadJSON)
	signature, err := signHMACSHA256(unsigned, secret)
	if err != nil {
		return "", err
	}
	return unsigned + "." + base64.RawURLEncoding.EncodeToString(signature), nil
}
