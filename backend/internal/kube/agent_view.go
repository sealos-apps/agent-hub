package kube

import (
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/nightwhite/Agent-Hub/internal/agent"
	networkingv1 "k8s.io/api/networking/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
)

type AgentView struct {
	Agent     agent.Agent
	CreatedAt string
}

func DevboxToAgentView(devbox *unstructured.Unstructured) (AgentView, error) {
	if devbox == nil {
		return AgentView{}, fmt.Errorf("devbox is nil")
	}

	name := strings.TrimSpace(devbox.GetName())
	namespace := strings.TrimSpace(devbox.GetNamespace())
	if name == "" || namespace == "" {
		return AgentView{}, fmt.Errorf("devbox metadata is incomplete")
	}

	annotations := devbox.GetAnnotations()
	templateID := strings.TrimSpace(annotations[annotationTemplateID])
	if templateID == "" {
		templateID = strings.TrimSpace(devbox.GetLabels()["app.kubernetes.io/name"])
	}
	if templateID == "" {
		return AgentView{}, fmt.Errorf("devbox %q is missing template id metadata", name)
	}
	bootstrapPhase := ""
	if rawPhase := strings.TrimSpace(annotations[annotationBootstrapPhase]); rawPhase != "" {
		bootstrapPhase = normalizeBootstrapPhase(rawPhase)
	}
	createdAt := devbox.GetCreationTimestamp().Format(time.RFC3339)
	if ts, found, _ := unstructured.NestedString(devbox.Object, "metadata", "creationTimestamp"); found && strings.TrimSpace(ts) != "" {
		createdAt = ts
	}

	cpu, _, _ := unstructured.NestedString(devbox.Object, "spec", "resource", "cpu")
	memory, _, _ := unstructured.NestedString(devbox.Object, "spec", "resource", "memory")
	storage, _, _ := unstructured.NestedString(devbox.Object, "spec", "storageLimit")
	state, _, _ := unstructured.NestedString(devbox.Object, "spec", "state")
	runtimeClassName, _, _ := unstructured.NestedString(devbox.Object, "spec", "runtimeClassName")
	networkType, _, _ := unstructured.NestedString(devbox.Object, "spec", "network", "type")
	modelProvider := strings.TrimSpace(annotations[annotationModelProvider])
	modelAPIKey := resolveModelAPIKey(devbox, modelProvider)

	view := AgentView{
		Agent: agent.Agent{
			Name:             name,
			TemplateID:       templateID,
			AliasName:        strings.TrimSpace(annotations[annotationAliasName]),
			Namespace:        namespace,
			CPU:              strings.TrimSpace(cpu),
			Memory:           strings.TrimSpace(memory),
			Storage:          strings.TrimSpace(storage),
			RuntimeClassName: strings.TrimSpace(runtimeClassName),
			WorkingDir:       workingDir(devbox),
			User:             userName(devbox),
			NetworkType:      strings.TrimSpace(networkType),
			SSHPort:          sshPort(devbox),
			ModelProvider:    modelProvider,
			ModelBaseURL:     strings.TrimSpace(annotations[annotationModelBaseURL]),
			Model:            strings.TrimSpace(annotations[annotationModel]),
			ModelAPIKey:      modelAPIKey,
			APIServerKey:     envValue(devbox, "API_SERVER_KEY"),
			BootstrapPhase:   bootstrapPhase,
			BootstrapMessage: strings.TrimSpace(annotations[annotationBootstrapMessage]),
			Ready:            bootstrapPhase == "" || bootstrapPhase == BootstrapPhaseReady,
			Status:           stateToStatus(state),
			Annotations:      cloneMap(annotations),
			Env:              envMap(devbox),
		},
		CreatedAt: createdAt,
	}

	return view, nil
}

func resolveModelAPIKey(devbox *unstructured.Unstructured, modelProvider string) string {
	primary := strings.TrimSpace(envValue(devbox, "AGENT_MODEL_APIKEY"))
	if primary != "" {
		return primary
	}

	if strings.HasPrefix(strings.ToLower(strings.TrimSpace(modelProvider)), "custom:aiproxy-") {
		return strings.TrimSpace(envValue(devbox, "AIPROXY_API_KEY"))
	}

	return strings.TrimSpace(envValue(devbox, "OPENAI_API_KEY"))
}

func IngressDomain(ingress *networkingv1.Ingress) string {
	if ingress == nil {
		return ""
	}
	if len(ingress.Spec.Rules) > 0 {
		return strings.TrimSpace(ingress.Spec.Rules[0].Host)
	}
	return ""
}

func APIBaseURL(host string) string {
	host = strings.TrimSpace(host)
	if host == "" {
		return ""
	}
	return "https://" + host + "/v1"
}

func stateToStatus(state string) agent.Status {
	switch strings.TrimSpace(strings.ToLower(state)) {
	case "creating":
		return agent.StatusCreating
	case "running":
		return agent.StatusRunning
	case "paused", "stopped":
		return agent.StatusPaused
	case "starting":
		return agent.StatusStarting
	case "stopping":
		return agent.StatusStopping
	case "updating":
		return agent.StatusUpdating
	case "deleting":
		return agent.StatusDeleting
	case "failed":
		return agent.StatusFailed
	default:
		return agent.StatusFailed
	}
}

func envValue(devbox *unstructured.Unstructured, name string) string {
	envs, found, _ := unstructured.NestedSlice(devbox.Object, "spec", "config", "env")
	if !found {
		return ""
	}
	for _, item := range envs {
		m, ok := item.(map[string]any)
		if !ok {
			continue
		}
		if strings.TrimSpace(fmt.Sprint(m["name"])) == name {
			value, exists := m["value"]
			if !exists || value == nil {
				return ""
			}
			return strings.TrimSpace(fmt.Sprint(value))
		}
	}
	return ""
}

func envMap(devbox *unstructured.Unstructured) map[string]string {
	envs, found, _ := unstructured.NestedSlice(devbox.Object, "spec", "config", "env")
	if !found {
		return map[string]string{}
	}

	result := make(map[string]string, len(envs))
	for _, item := range envs {
		m, ok := item.(map[string]any)
		if !ok {
			continue
		}
		name := strings.TrimSpace(fmt.Sprint(m["name"]))
		if name == "" {
			continue
		}
		value, exists := m["value"]
		if !exists || value == nil {
			result[name] = ""
			continue
		}
		result[name] = strings.TrimSpace(fmt.Sprint(value))
	}
	return result
}

func workingDir(devbox *unstructured.Unstructured) string {
	value, _, _ := unstructured.NestedString(devbox.Object, "spec", "config", "workingDir")
	return strings.TrimSpace(value)
}

func userName(devbox *unstructured.Unstructured) string {
	value, _, _ := unstructured.NestedString(devbox.Object, "spec", "config", "user")
	return strings.TrimSpace(value)
}

func sshPort(devbox *unstructured.Unstructured) int32 {
	networkType, _, _ := unstructured.NestedString(devbox.Object, "spec", "network", "type")
	if strings.EqualFold(strings.TrimSpace(networkType), "SSHGate") {
		return 2233
	}

	value, found, _ := unstructured.NestedInt64(devbox.Object, "status", "network", "nodePort")
	if !found || value <= 0 {
		return 0
	}
	return int32(value)
}

func SetEnvValue(devbox *unstructured.Unstructured, name, value string) error {
	envs, found, _ := unstructured.NestedSlice(devbox.Object, "spec", "config", "env")
	if !found {
		envs = []any{}
	}

	updated := false
	for idx, item := range envs {
		m, ok := item.(map[string]any)
		if !ok {
			continue
		}
		if strings.TrimSpace(fmt.Sprint(m["name"])) == name {
			m["value"] = value
			envs[idx] = m
			updated = true
			break
		}
	}
	if !updated {
		envs = append(envs, map[string]any{"name": name, "value": value})
	}
	return unstructured.SetNestedSlice(devbox.Object, envs, "spec", "config", "env")
}

func SetAnnotation(devbox *unstructured.Unstructured, key, value string) error {
	annotations := devbox.GetAnnotations()
	if annotations == nil {
		annotations = map[string]string{}
	}
	if value == "" {
		delete(annotations, key)
	} else {
		annotations[key] = value
	}
	devbox.SetAnnotations(annotations)
	return nil
}

func HasManagedLabel(obj map[string]string, agentName string) bool {
	if obj == nil {
		return false
	}
	return strings.TrimSpace(obj["agent.sealos.io/name"]) == agentName && strings.TrimSpace(obj["agent.sealos.io/managed-by"]) == managedByValue
}

func cloneMap(input map[string]string) map[string]string {
	if len(input) == 0 {
		return map[string]string{}
	}
	result := make(map[string]string, len(input))
	for key, value := range input {
		result[key] = value
	}
	return result
}

func SortViewsByCreatedAtDesc(items []AgentView) {
	sort.Slice(items, func(i, j int) bool {
		return items[i].CreatedAt > items[j].CreatedAt
	})
}
