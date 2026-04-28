package handler

import (
	"context"
	"fmt"
	"sort"
	"strings"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/client-go/kubernetes"

	"github.com/nightwhite/Agent-Hub/internal/agent"
	"github.com/nightwhite/Agent-Hub/internal/kube"
)

var fatalContainerWaitingReasons = map[string]struct{}{
	"createcontainerconfigerror": {},
	"createcontainererror":       {},
	"crashloopbackoff":           {},
	"errimagepull":               {},
	"imagepullbackoff":           {},
	"invalidimagename":           {},
	"runcontainererror":          {},
}

func enrichAgentRuntimeStatus(ctx context.Context, clientset kubernetes.Interface, devbox *unstructured.Unstructured, view *kube.AgentView) {
	if view == nil || devbox == nil {
		return
	}

	view.Agent.Status = resolveAgentRuntimeStatus(ctx, clientset, devbox, view.Agent.Namespace, view.Agent.Name)
}

func enrichAgentRuntimeStatusWithPod(devbox *unstructured.Unstructured, view *kube.AgentView, pod *corev1.Pod) {
	if view == nil || devbox == nil {
		return
	}

	view.Agent.Status = resolveAgentRuntimeStatusFromPod(devbox, pod)
}

func resolveAgentRuntimeStatus(
	ctx context.Context,
	clientset kubernetes.Interface,
	devbox *unstructured.Unstructured,
	namespace string,
	agentName string,
) agent.Status {
	if devbox == nil {
		return agent.StatusFailed
	}
	if devbox.GetDeletionTimestamp() != nil {
		return agent.StatusDeleting
	}

	bootstrapPhase := kube.BootstrapPhase(devbox)
	if bootstrapPhase == kube.BootstrapPhaseFailed {
		return agent.StatusFailed
	}

	desiredState := strings.ToLower(strings.TrimSpace(nestedString(devbox, "spec", "state")))
	switch desiredState {
	case "paused", "stopped":
		return agent.StatusPaused
	case "failed", "error":
		return agent.StatusFailed
	case "deleting":
		return agent.StatusDeleting
	}

	pod, err := getLatestAgentPod(ctx, clientset, namespace, agentName)
	if err == nil && pod != nil {
		return resolveAgentRuntimeStatusFromPod(devbox, pod)
	}

	return statusFromDevbox(devbox, desiredState, bootstrapPhase)
}

func resolveAgentRuntimeStatusFromPod(devbox *unstructured.Unstructured, pod *corev1.Pod) agent.Status {
	if devbox == nil {
		return agent.StatusFailed
	}
	if devbox.GetDeletionTimestamp() != nil {
		return agent.StatusDeleting
	}

	bootstrapPhase := kube.BootstrapPhase(devbox)
	if bootstrapPhase == kube.BootstrapPhaseFailed {
		return agent.StatusFailed
	}

	desiredState := strings.ToLower(strings.TrimSpace(nestedString(devbox, "spec", "state")))
	switch desiredState {
	case "paused", "stopped":
		return agent.StatusPaused
	case "failed", "error":
		return agent.StatusFailed
	case "deleting":
		return agent.StatusDeleting
	}

	if pod != nil {
		return statusFromPod(pod, bootstrapPhase)
	}

	return statusFromDevbox(devbox, desiredState, bootstrapPhase)
}

func getLatestAgentPod(ctx context.Context, clientset kubernetes.Interface, namespace, agentName string) (*corev1.Pod, error) {
	pods, err := clientset.CoreV1().Pods(namespace).List(ctx, metav1.ListOptions{
		LabelSelector: kube.ManagedSelector(agentName),
	})
	if err != nil {
		return nil, err
	}
	if len(pods.Items) == 0 {
		return nil, nil
	}

	items := append([]corev1.Pod(nil), pods.Items...)
	sort.Slice(items, func(i, j int) bool {
		return items[i].CreationTimestamp.Time.After(items[j].CreationTimestamp.Time)
	})

	for idx := range items {
		if items[idx].DeletionTimestamp == nil {
			return &items[idx], nil
		}
	}

	return &items[0], nil
}

func statusFromPod(pod *corev1.Pod, bootstrapPhase string) agent.Status {
	if pod == nil {
		return agent.StatusCreating
	}
	if pod.DeletionTimestamp != nil {
		return agent.StatusDeleting
	}
	if hasFatalContainerState(pod) {
		return agent.StatusFailed
	}

	switch pod.Status.Phase {
	case corev1.PodRunning:
		if isPodReady(pod) {
			if bootstrapPhase != "" && bootstrapPhase != kube.BootstrapPhaseReady {
				return agent.StatusStarting
			}
			return agent.StatusRunning
		}
		return agent.StatusCreating
	case corev1.PodPending:
		return agent.StatusCreating
	case corev1.PodSucceeded:
		return agent.StatusPaused
	case corev1.PodFailed:
		return agent.StatusFailed
	default:
		return agent.StatusCreating
	}
}

func statusFromDevbox(devbox *unstructured.Unstructured, desiredState string, bootstrapPhase string) agent.Status {
	if hasFailedPodSync(devbox) {
		return agent.StatusFailed
	}

	switch strings.ToLower(strings.TrimSpace(nestedString(devbox, "status", "phase"))) {
	case "running":
		if bootstrapPhase != "" && bootstrapPhase != kube.BootstrapPhaseReady {
			return agent.StatusStarting
		}
		return agent.StatusRunning
	case "paused", "stopped":
		return agent.StatusPaused
	case "failed", "error":
		return agent.StatusFailed
	case "deleting":
		return agent.StatusDeleting
	default:
		return agent.StatusCreating
	}
}

func hasFailedPodSync(devbox *unstructured.Unstructured) bool {
	conditions, found, _ := unstructured.NestedSlice(devbox.Object, "status", "conditions")
	if !found {
		return false
	}

	for _, item := range conditions {
		condition, ok := item.(map[string]any)
		if !ok {
			continue
		}

		typeName := strings.ToLower(strings.TrimSpace(toString(condition["type"])))
		status := strings.ToLower(strings.TrimSpace(toString(condition["status"])))
		if typeName != "podsynced" || status != "false" {
			continue
		}

		reason := strings.ToLower(strings.TrimSpace(toString(condition["reason"])))
		message := strings.ToLower(strings.TrimSpace(toString(condition["message"])))
		combined := reason + " " + message

		if strings.Contains(combined, "failed") ||
			strings.Contains(combined, "forbidden") ||
			strings.Contains(combined, "quota") ||
			strings.Contains(combined, "backoff") ||
			strings.Contains(combined, "error") ||
			strings.Contains(combined, "imagepull") ||
			strings.Contains(combined, "denied") {
			return true
		}
	}

	return false
}

func hasFatalContainerState(pod *corev1.Pod) bool {
	if pod == nil {
		return false
	}

	for _, status := range pod.Status.ContainerStatuses {
		if status.State.Waiting != nil {
			reason := strings.ToLower(strings.TrimSpace(status.State.Waiting.Reason))
			if _, fatal := fatalContainerWaitingReasons[reason]; fatal {
				return true
			}
		}

		if status.State.Terminated != nil && status.State.Terminated.ExitCode != 0 {
			return true
		}
	}

	return false
}

func isPodReady(pod *corev1.Pod) bool {
	if pod == nil || len(pod.Status.ContainerStatuses) == 0 {
		return false
	}

	for _, status := range pod.Status.ContainerStatuses {
		if !status.Ready {
			return false
		}
	}

	return true
}

func nestedString(object *unstructured.Unstructured, fields ...string) string {
	value, _, _ := unstructured.NestedString(object.Object, fields...)
	return value
}

func toString(value any) string {
	if value == nil {
		return ""
	}
	return strings.TrimSpace(fmt.Sprint(value))
}
