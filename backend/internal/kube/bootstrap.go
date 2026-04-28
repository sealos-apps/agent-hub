package kube

import (
	"strings"

	"github.com/nightwhite/Agent-Hub/internal/agent"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
)

func TemplateID(obj *unstructured.Unstructured) string {
	if obj == nil {
		return ""
	}
	return strings.TrimSpace(obj.GetAnnotations()[annotationTemplateID])
}

func BootstrapPhase(obj *unstructured.Unstructured) string {
	if obj == nil {
		return ""
	}
	raw := strings.TrimSpace(obj.GetAnnotations()[annotationBootstrapPhase])
	if raw == "" {
		return ""
	}
	return normalizeBootstrapPhase(raw)
}

func BootstrapMessage(obj *unstructured.Unstructured) string {
	if obj == nil {
		return ""
	}
	return strings.TrimSpace(obj.GetAnnotations()[annotationBootstrapMessage])
}

func SetBootstrapStatus(obj *unstructured.Unstructured, phase, message string) error {
	if err := SetAnnotation(obj, annotationBootstrapPhase, normalizeBootstrapPhase(phase)); err != nil {
		return err
	}
	return SetAnnotation(obj, annotationBootstrapMessage, strings.TrimSpace(message))
}

func SetTemplateID(obj *unstructured.Unstructured, templateID string) error {
	return SetAnnotation(obj, annotationTemplateID, strings.TrimSpace(templateID))
}

func SetAgentAlias(obj *unstructured.Unstructured, aliasName string) error {
	return SetAnnotation(obj, annotationAliasName, strings.TrimSpace(aliasName))
}

func SetModelProvider(obj *unstructured.Unstructured, value string) error {
	return SetAnnotation(obj, annotationModelProvider, strings.TrimSpace(value))
}

func SetModelBaseURL(obj *unstructured.Unstructured, value string) error {
	return SetAnnotation(obj, annotationModelBaseURL, strings.TrimSpace(value))
}

func SetModelName(obj *unstructured.Unstructured, value string) error {
	return SetAnnotation(obj, annotationModel, strings.TrimSpace(value))
}

func IsBootstrapReady(spec agent.Agent) bool {
	return normalizeBootstrapPhase(spec.BootstrapPhase) == BootstrapPhaseReady
}
