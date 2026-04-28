package kube

import (
	"context"
	"strings"
	"testing"
	"time"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes/fake"
)

func TestResolveAgentPodPrefersExecReadyContainer(t *testing.T) {
	t.Parallel()

	now := time.Now()
	clientset := fake.NewSimpleClientset(
		newAgentPodForResolveTest("agent-pending", "hermes", metav1.NewTime(now), false, false),
		newAgentPodForResolveTest("agent-ready", "hermes", metav1.NewTime(now.Add(-time.Minute)), true, false),
	)

	got, err := ResolveAgentPod(context.Background(), clientset, "ns-test", "hermes")
	if err != nil {
		t.Fatalf("ResolveAgentPod() error = %v, want nil", err)
	}
	if got.Name != "agent-ready" {
		t.Fatalf("ResolveAgentPod() pod name = %q, want %q", got.Name, "agent-ready")
	}
	if got.Container != "hermes" {
		t.Fatalf("ResolveAgentPod() container = %q, want %q", got.Container, "hermes")
	}
}

func TestResolveAgentPodSkipsDeletingPods(t *testing.T) {
	t.Parallel()

	now := time.Now()
	clientset := fake.NewSimpleClientset(
		newAgentPodForResolveTest("agent-deleting", "hermes", metav1.NewTime(now), true, true),
		newAgentPodForResolveTest("agent-live", "hermes", metav1.NewTime(now.Add(-time.Minute)), true, false),
	)

	got, err := ResolveAgentPod(context.Background(), clientset, "ns-test", "hermes")
	if err != nil {
		t.Fatalf("ResolveAgentPod() error = %v, want nil", err)
	}
	if got.Name != "agent-live" {
		t.Fatalf("ResolveAgentPod() pod name = %q, want %q", got.Name, "agent-live")
	}
}

func TestResolveAgentPodReturnsNotReadyWhenContainerIsUnavailable(t *testing.T) {
	t.Parallel()

	clientset := fake.NewSimpleClientset(
		newAgentPodForResolveTest("agent-pending", "hermes", metav1.NewTime(time.Now()), false, false),
	)

	_, err := ResolveAgentPod(context.Background(), clientset, "ns-test", "hermes")
	if err == nil {
		t.Fatal("ResolveAgentPod() error = nil, want not ready error")
	}
	if !strings.Contains(err.Error(), "agent pod container is not ready") {
		t.Fatalf("ResolveAgentPod() error = %v, want not ready error", err)
	}
}

func TestResolveAgentPodFallsBackToLegacySelectorWithoutManagedBy(t *testing.T) {
	t.Parallel()

	now := time.Now()
	clientset := fake.NewSimpleClientset(
		newAgentPodForResolveTestWithoutManagedBy("agent-legacy", "hermes", metav1.NewTime(now), true, false),
	)

	got, err := ResolveAgentPod(context.Background(), clientset, "ns-test", "hermes")
	if err != nil {
		t.Fatalf("ResolveAgentPod() error = %v, want nil", err)
	}
	if got.Name != "agent-legacy" {
		t.Fatalf("ResolveAgentPod() pod name = %q, want %q", got.Name, "agent-legacy")
	}
	if got.Container != "hermes" {
		t.Fatalf("ResolveAgentPod() container = %q, want %q", got.Container, "hermes")
	}
}

func TestResolveAgentPodLegacySelectorSkipsPodsManagedByOthers(t *testing.T) {
	t.Parallel()

	now := time.Now()
	otherManaged := newAgentPodForResolveTest("agent-other-managed", "hermes", metav1.NewTime(now), true, false)
	otherManaged.Labels["agent.sealos.io/managed-by"] = "another-controller"
	legacy := newAgentPodForResolveTestWithoutManagedBy("agent-legacy", "hermes", metav1.NewTime(now.Add(-time.Minute)), true, false)

	clientset := fake.NewSimpleClientset(otherManaged, legacy)

	got, err := ResolveAgentPod(context.Background(), clientset, "ns-test", "hermes")
	if err != nil {
		t.Fatalf("ResolveAgentPod() error = %v, want nil", err)
	}
	if got.Name != "agent-legacy" {
		t.Fatalf("ResolveAgentPod() pod name = %q, want %q", got.Name, "agent-legacy")
	}
	if got.Container != "hermes" {
		t.Fatalf("ResolveAgentPod() container = %q, want %q", got.Container, "hermes")
	}
}

func newAgentPodForResolveTest(name, agentName string, createdAt metav1.Time, ready bool, deleting bool) *corev1.Pod {
	pod := &corev1.Pod{
		ObjectMeta: metav1.ObjectMeta{
			Name:              name,
			Namespace:         "ns-test",
			CreationTimestamp: createdAt,
			Labels: map[string]string{
				"agent.sealos.io/name":       agentName,
				"agent.sealos.io/managed-by": ManagedByValue(),
			},
		},
		Spec: corev1.PodSpec{
			Containers: []corev1.Container{{
				Name: agentName,
			}},
		},
		Status: corev1.PodStatus{
			Phase: corev1.PodRunning,
			ContainerStatuses: []corev1.ContainerStatus{{
				Name:  agentName,
				Ready: ready,
				State: corev1.ContainerState{},
			}},
		},
	}

	if ready {
		pod.Status.ContainerStatuses[0].State.Running = &corev1.ContainerStateRunning{}
	} else {
		pod.Status.ContainerStatuses[0].State.Waiting = &corev1.ContainerStateWaiting{Reason: "ContainerCreating"}
	}

	if deleting {
		now := metav1.NewTime(createdAt.Time.Add(30 * time.Second))
		pod.DeletionTimestamp = &now
	}

	return pod
}

func newAgentPodForResolveTestWithoutManagedBy(name, agentName string, createdAt metav1.Time, ready bool, deleting bool) *corev1.Pod {
	pod := newAgentPodForResolveTest(name, agentName, createdAt, ready, deleting)
	delete(pod.Labels, "agent.sealos.io/managed-by")
	return pod
}
