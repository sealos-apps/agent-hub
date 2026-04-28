package kube

import (
	"fmt"
	"strings"

	"github.com/nightwhite/Agent-Hub/internal/agent"
)

const (
	managedByValue             = "agent-hub-backend"
	annotationAliasName        = "agent.sealos.io/alias-name"
	annotationModelProvider    = "agent.sealos.io/model-provider"
	annotationModelBaseURL     = "agent.sealos.io/model-baseurl"
	annotationModel            = "agent.sealos.io/model"
	annotationTemplateID       = "agent.sealos.io/template-id"
	annotationBootstrapPhase   = "agent.sealos.io/bootstrap-phase"
	annotationBootstrapMessage = "agent.sealos.io/bootstrap-message"
)

const (
	BootstrapPhasePending = "pending"
	BootstrapPhaseRunning = "running"
	BootstrapPhaseReady   = "ready"
	BootstrapPhaseFailed  = "failed"
)

func Labels(spec agent.Agent) map[string]string {
	templateID := strings.TrimSpace(spec.TemplateID)
	if templateID == "" {
		templateID = "hermes-agent"
	}

	return map[string]string{
		"app.kubernetes.io/name":     templateID,
		"app.kubernetes.io/instance": spec.Name,
		"agent.sealos.io/name":       spec.Name,
		"agent.sealos.io/managed-by": managedByValue,
		"app":                        spec.Name,
	}
}

func Annotations(spec agent.Agent) map[string]string {
	annotations := map[string]string{
		annotationModelProvider:  strings.TrimSpace(spec.ModelProvider),
		annotationModelBaseURL:   strings.TrimSpace(spec.ModelBaseURL),
		annotationModel:          strings.TrimSpace(spec.Model),
		annotationTemplateID:     strings.TrimSpace(spec.TemplateID),
		annotationBootstrapPhase: normalizeBootstrapPhase(spec.BootstrapPhase),
	}
	if aliasName := strings.TrimSpace(spec.AliasName); aliasName != "" {
		annotations[annotationAliasName] = aliasName
	}
	if message := strings.TrimSpace(spec.BootstrapMessage); message != "" {
		annotations[annotationBootstrapMessage] = message
	}
	return annotations
}

func ManagedSelector(agentName string) string {
	return fmt.Sprintf("agent.sealos.io/name=%s,agent.sealos.io/managed-by=%s", agentName, managedByValue)
}

func ManagedListSelector() string {
	return fmt.Sprintf("agent.sealos.io/managed-by=%s", managedByValue)
}

func ManagedByValue() string {
	return managedByValue
}

func normalizeBootstrapPhase(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case BootstrapPhaseRunning:
		return BootstrapPhaseRunning
	case BootstrapPhaseReady:
		return BootstrapPhaseReady
	case BootstrapPhaseFailed:
		return BootstrapPhaseFailed
	default:
		return BootstrapPhasePending
	}
}
