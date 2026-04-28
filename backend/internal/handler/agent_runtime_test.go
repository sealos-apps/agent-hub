package handler

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/nightwhite/Agent-Hub/internal/agent"
	"github.com/nightwhite/Agent-Hub/internal/kube"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/client-go/kubernetes/fake"
)

func TestResolveAgentRuntimeStatusUsesPodReadiness(t *testing.T) {
	t.Parallel()

	devbox := newDevboxForStatusTest("Running")
	clientset := fake.NewSimpleClientset(&corev1.Pod{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "hermes",
			Namespace: "ns-test",
			Labels: map[string]string{
				"agent.sealos.io/name":       "hermes",
				"agent.sealos.io/managed-by": "agent-hub-backend",
			},
		},
		Status: corev1.PodStatus{
			Phase: corev1.PodRunning,
			ContainerStatuses: []corev1.ContainerStatus{{
				Name:  "hermes",
				Ready: true,
			}},
		},
	})

	got := resolveAgentRuntimeStatus(context.Background(), clientset, devbox, "ns-test", "hermes")
	if got != agent.StatusRunning {
		t.Fatalf("resolveAgentRuntimeStatus() = %q, want %q", got, agent.StatusRunning)
	}
}

func TestResolveAgentRuntimeStatusTreatsContainerCreatingAsCreating(t *testing.T) {
	t.Parallel()

	devbox := newDevboxForStatusTest("Running")
	clientset := fake.NewSimpleClientset(&corev1.Pod{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "hermes",
			Namespace: "ns-test",
			Labels: map[string]string{
				"agent.sealos.io/name":       "hermes",
				"agent.sealos.io/managed-by": "agent-hub-backend",
			},
		},
		Status: corev1.PodStatus{
			Phase: corev1.PodPending,
			ContainerStatuses: []corev1.ContainerStatus{{
				Name: "hermes",
				State: corev1.ContainerState{
					Waiting: &corev1.ContainerStateWaiting{
						Reason: "ContainerCreating",
					},
				},
			}},
		},
	})

	got := resolveAgentRuntimeStatus(context.Background(), clientset, devbox, "ns-test", "hermes")
	if got != agent.StatusCreating {
		t.Fatalf("resolveAgentRuntimeStatus() = %q, want %q", got, agent.StatusCreating)
	}
}

func TestResolveAgentRuntimeStatusTreatsFailedPodSyncAsFailed(t *testing.T) {
	t.Parallel()

	devbox := newDevboxForStatusTest("Running")
	devbox.Object["status"] = map[string]any{
		"phase": "Pending",
		"conditions": []any{
			map[string]any{
				"type":    "PodSynced",
				"status":  "False",
				"reason":  "SyncFailed",
				"message": `sync pod failed: exceeded quota`,
			},
		},
	}

	clientset := fake.NewSimpleClientset()
	got := resolveAgentRuntimeStatus(context.Background(), clientset, devbox, "ns-test", "hermes")
	if got != agent.StatusFailed {
		t.Fatalf("resolveAgentRuntimeStatus() = %q, want %q", got, agent.StatusFailed)
	}
}

func TestResolveAgentRuntimeStatusRespectsPausedState(t *testing.T) {
	t.Parallel()

	devbox := newDevboxForStatusTest("Paused")
	clientset := fake.NewSimpleClientset()

	got := resolveAgentRuntimeStatus(context.Background(), clientset, devbox, "ns-test", "hermes")
	if got != agent.StatusPaused {
		t.Fatalf("resolveAgentRuntimeStatus() = %q, want %q", got, agent.StatusPaused)
	}
}

func TestListManagedLatestAgentPodsFallsBackToLegacyPods(t *testing.T) {
	t.Parallel()

	now := time.Now()
	clientset := fake.NewSimpleClientset(
		newAgentPodForManagedListTest("agent-legacy", "hermes", metav1.NewTime(now), ""),
	)

	latest, err := listManagedLatestAgentPods(context.Background(), clientset, "ns-test")
	if err != nil {
		t.Fatalf("listManagedLatestAgentPods() error = %v, want nil", err)
	}

	got := latest["hermes"]
	if got == nil || got.Name != "agent-legacy" {
		t.Fatalf("listManagedLatestAgentPods() legacy fallback pod = %#v, want agent-legacy", got)
	}
}

func TestListManagedLatestAgentPodsSkipsLegacyPodsManagedByOthers(t *testing.T) {
	t.Parallel()

	now := time.Now()
	clientset := fake.NewSimpleClientset(
		newAgentPodForManagedListTest("agent-other-managed", "hermes", metav1.NewTime(now), "another-controller"),
		newAgentPodForManagedListTest("agent-legacy", "hermes", metav1.NewTime(now.Add(-time.Minute)), ""),
	)

	latest, err := listManagedLatestAgentPods(context.Background(), clientset, "ns-test")
	if err != nil {
		t.Fatalf("listManagedLatestAgentPods() error = %v, want nil", err)
	}

	got := latest["hermes"]
	if got == nil || got.Name != "agent-legacy" {
		t.Fatalf("listManagedLatestAgentPods() fallback pod = %#v, want agent-legacy", got)
	}
}

func TestListManagedLatestAgentPodsPrefersManagedPodsOverLegacy(t *testing.T) {
	t.Parallel()

	now := time.Now()
	clientset := fake.NewSimpleClientset(
		newAgentPodForManagedListTest("agent-managed", "hermes", metav1.NewTime(now.Add(-time.Minute)), kube.ManagedByValue()),
		newAgentPodForManagedListTest("agent-legacy-newer", "hermes", metav1.NewTime(now), ""),
	)

	latest, err := listManagedLatestAgentPods(context.Background(), clientset, "ns-test")
	if err != nil {
		t.Fatalf("listManagedLatestAgentPods() error = %v, want nil", err)
	}

	got := latest["hermes"]
	if got == nil || got.Name != "agent-managed" {
		t.Fatalf("listManagedLatestAgentPods() selected pod = %#v, want agent-managed", got)
	}
}

func newDevboxForStatusTest(state string) *unstructured.Unstructured {
	return &unstructured.Unstructured{
		Object: map[string]any{
			"metadata": map[string]any{
				"name":      "hermes",
				"namespace": "ns-test",
			},
			"spec": map[string]any{
				"state": state,
			},
		},
	}
}

func newAgentPodForManagedListTest(name, agentName string, createdAt metav1.Time, managedBy string) *corev1.Pod {
	labels := map[string]string{
		"agent.sealos.io/name": agentName,
	}
	if strings.TrimSpace(managedBy) != "" {
		labels["agent.sealos.io/managed-by"] = strings.TrimSpace(managedBy)
	}
	return &corev1.Pod{
		ObjectMeta: metav1.ObjectMeta{
			Name:              name,
			Namespace:         "ns-test",
			CreationTimestamp: createdAt,
			Labels:            labels,
		},
	}
}
