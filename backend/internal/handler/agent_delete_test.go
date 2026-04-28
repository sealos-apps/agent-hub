package handler

import (
	"context"
	"fmt"
	"testing"

	"github.com/nightwhite/Agent-Hub/internal/kube"
	corev1 "k8s.io/api/core/v1"
	networkingv1 "k8s.io/api/networking/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
	dynamicfake "k8s.io/client-go/dynamic/fake"
	k8sfake "k8s.io/client-go/kubernetes/fake"
	ktesting "k8s.io/client-go/testing"
)

func TestDeleteManagedAgentResourcesSucceedsWhenServiceAndIngressAreMissing(t *testing.T) {
	t.Parallel()

	const namespace = "ns-test"
	const agentName = "hermes"

	repo := newDeleteAgentRepo(t, namespace, agentName)
	clientset := k8sfake.NewSimpleClientset()

	if err := deleteManagedAgentResources(context.Background(), repo, clientset, namespace, agentName); err != nil {
		t.Fatalf("deleteManagedAgentResources() error = %v, want nil", err)
	}

	if _, err := repo.Get(context.Background(), agentName); !apierrors.IsNotFound(err) {
		t.Fatalf("repo.Get() error = %v, want not found", err)
	}
}

func TestDeleteManagedAgentResourcesDeletesManagedChildrenBySelector(t *testing.T) {
	t.Parallel()

	const namespace = "ns-test"
	const agentName = "hermes"

	repo := newDeleteAgentRepo(t, namespace, agentName)
	clientset := k8sfake.NewSimpleClientset(
		&corev1.Service{
			ObjectMeta: metav1.ObjectMeta{
				Name:      "svc-hermes-legacy",
				Namespace: namespace,
				Labels: map[string]string{
					"app.kubernetes.io/name":     "hermes-agent",
					"agent.sealos.io/name":       agentName,
					"agent.sealos.io/managed-by": kube.ManagedByValue(),
				},
			},
		},
		&networkingv1.Ingress{
			ObjectMeta: metav1.ObjectMeta{
				Name:      "ing-hermes-legacy",
				Namespace: namespace,
				Labels: map[string]string{
					"app.kubernetes.io/name":     "hermes-agent",
					"agent.sealos.io/name":       agentName,
					"agent.sealos.io/managed-by": kube.ManagedByValue(),
				},
			},
		},
	)

	if err := deleteManagedAgentResources(context.Background(), repo, clientset, namespace, agentName); err != nil {
		t.Fatalf("deleteManagedAgentResources() error = %v, want nil", err)
	}

	if _, err := repo.Get(context.Background(), agentName); !apierrors.IsNotFound(err) {
		t.Fatalf("repo.Get() error = %v, want not found", err)
	}
	if _, err := clientset.CoreV1().Services(namespace).Get(context.Background(), "svc-hermes-legacy", metav1.GetOptions{}); !apierrors.IsNotFound(err) {
		t.Fatalf("service get error = %v, want not found", err)
	}
	if _, err := clientset.NetworkingV1().Ingresses(namespace).Get(context.Background(), "ing-hermes-legacy", metav1.GetOptions{}); !apierrors.IsNotFound(err) {
		t.Fatalf("ingress get error = %v, want not found", err)
	}
}

func TestDeleteManagedAgentResourcesSucceedsWhenDevboxIsAlreadyMissing(t *testing.T) {
	t.Parallel()

	const namespace = "ns-test"
	const agentName = "hermes"

	repo := kube.NewRepository(
		dynamicfake.NewSimpleDynamicClientWithCustomListKinds(
			runtime.NewScheme(),
			map[schema.GroupVersionResource]string{
				kube.ResourceGVR(): "DevboxList",
			},
		),
		namespace,
	)
	clientset := k8sfake.NewSimpleClientset(
		&networkingv1.Ingress{
			ObjectMeta: metav1.ObjectMeta{
				Name:      "ing-hermes-orphan",
				Namespace: namespace,
				Labels: map[string]string{
					"app.kubernetes.io/name":     "hermes-agent",
					"agent.sealos.io/name":       agentName,
					"agent.sealos.io/managed-by": kube.ManagedByValue(),
				},
			},
		},
	)

	if err := deleteManagedAgentResources(context.Background(), repo, clientset, namespace, agentName); err != nil {
		t.Fatalf("deleteManagedAgentResources() error = %v, want nil", err)
	}

	if _, err := clientset.NetworkingV1().Ingresses(namespace).Get(context.Background(), "ing-hermes-orphan", metav1.GetOptions{}); !apierrors.IsNotFound(err) {
		t.Fatalf("ingress get error = %v, want not found", err)
	}
}

func TestDeleteManagedAgentResourcesReturnsErrorWhenDevboxMissingAndServiceDeleteFails(t *testing.T) {
	t.Parallel()

	const namespace = "ns-test"
	const agentName = "hermes"

	repo := kube.NewRepository(
		dynamicfake.NewSimpleDynamicClientWithCustomListKinds(
			runtime.NewScheme(),
			map[schema.GroupVersionResource]string{
				kube.ResourceGVR(): "DevboxList",
			},
		),
		namespace,
	)
	clientset := k8sfake.NewSimpleClientset(
		&corev1.Service{
			ObjectMeta: metav1.ObjectMeta{
				Name:      "svc-hermes",
				Namespace: namespace,
				Labels: map[string]string{
					"app.kubernetes.io/name":     "hermes-agent",
					"agent.sealos.io/name":       agentName,
					"agent.sealos.io/managed-by": kube.ManagedByValue(),
				},
			},
		},
	)
	clientset.PrependReactor("delete", "services", func(ktesting.Action) (bool, runtime.Object, error) {
		return true, nil, fmt.Errorf("delete denied")
	})

	err := deleteManagedAgentResources(context.Background(), repo, clientset, namespace, agentName)
	if err == nil {
		t.Fatal("deleteManagedAgentResources() error = nil, want non-nil when devbox missing and service delete fails")
	}
}

func newDeleteAgentRepo(t *testing.T, namespace, agentName string) *kube.Repository {
	t.Helper()

	dynamicClient := dynamicfake.NewSimpleDynamicClientWithCustomListKinds(
		runtime.NewScheme(),
		map[schema.GroupVersionResource]string{
			kube.ResourceGVR(): "DevboxList",
		},
	)
	repo := kube.NewRepository(dynamicClient, namespace)

	devbox := &unstructured.Unstructured{
		Object: map[string]any{
			"apiVersion": "devbox.sealos.io/v1alpha2",
			"kind":       "Devbox",
			"metadata": map[string]any{
				"name":      agentName,
				"namespace": namespace,
				"labels": map[string]any{
					"app.kubernetes.io/name":     "hermes-agent",
					"agent.sealos.io/name":       agentName,
					"agent.sealos.io/managed-by": kube.ManagedByValue(),
				},
			},
		},
	}

	if _, err := repo.Create(context.Background(), devbox); err != nil {
		t.Fatalf("repo.Create() error = %v", err)
	}

	return repo
}
