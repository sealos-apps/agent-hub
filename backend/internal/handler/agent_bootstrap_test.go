package handler

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/nightwhite/Agent-Hub/internal/agent"
	"github.com/nightwhite/Agent-Hub/internal/agenttemplate"
	"github.com/nightwhite/Agent-Hub/internal/config"
	"github.com/nightwhite/Agent-Hub/internal/kube"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/dynamic"
	dynamicfake "k8s.io/client-go/dynamic/fake"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/kubernetes/fake"
	"k8s.io/client-go/tools/remotecommand"
)

func TestRunAgentBootstrapLifecycleSyncsModelBeforeHealthcheck(t *testing.T) {
	factory, appErr := kube.NewFactoryFromEncodedKubeconfig(testEncodedKubeconfig())
	if appErr != nil {
		t.Fatalf("NewFactoryFromEncodedKubeconfig() error = %v", appErr)
	}

	clientset := fake.NewSimpleClientset(&corev1.Pod{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "demo-agent-0",
			Namespace: factory.Namespace(),
			Labels: map[string]string{
				"agent.sealos.io/name":       "demo-agent",
				"agent.sealos.io/managed-by": kube.ManagedByValue(),
			},
		},
		Spec: corev1.PodSpec{Containers: []corev1.Container{{Name: "agent"}}},
		Status: corev1.PodStatus{
			Phase: corev1.PodRunning,
			ContainerStatuses: []corev1.ContainerStatus{{
				Name:  "agent",
				Ready: true,
			}},
		},
	})
	dynamicClient := fakeBootstrapDynamicClient(t, factory.Namespace(), "demo-agent")

	templateDef := testModelSyncIntegrationTemplate()
	templateDef.Bootstrap = agenttemplate.ScriptSpec{Script: "bootstrap.sh", TimeoutSeconds: 30}
	templateDef.Healthcheck = agenttemplate.ScriptSpec{Script: "healthcheck.sh", TimeoutSeconds: 30}

	spec := agent.Agent{
		Name:          "demo-agent",
		TemplateID:    "cowagent",
		ModelProvider: aiproxyChatProvider,
		ModelBaseURL:  "https://aiproxy.usw-1.sealos.io/v1",
		ModelAPIKey:   "sk-test",
		Model:         "glm-5.1",
		Annotations: map[string]string{
			"agent.sealos.io/model-slots": `{"main":{"provider":"custom:aiproxy-chat","model":"glm-5.1","apiMode":"chat_completions","kind":"llm"},"vision":{"provider":"custom:aiproxy-chat","model":"gpt-5.4-mini","apiMode":"chat_completions","kind":"llm"}}`,
		},
	}

	previousKubernetes := bootstrapKubernetesClient
	previousDynamic := bootstrapDynamicClient
	previousExec := execAgentCommandWithRetry
	previousRead := readTemplateScriptFile
	defer func() {
		bootstrapKubernetesClient = previousKubernetes
		bootstrapDynamicClient = previousDynamic
		execAgentCommandWithRetry = previousExec
		readTemplateScriptFile = previousRead
	}()

	bootstrapKubernetesClient = func(*kube.Factory) (kubernetes.Interface, error) { return clientset, nil }
	bootstrapDynamicClient = func(*kube.Factory) (dynamic.Interface, error) { return dynamicClient, nil }
	readTemplateScriptFile = func(scriptName, scriptPath string) ([]byte, error) { return []byte("echo " + scriptName), nil }

	var calls []string
	execAgentCommandWithRetry = func(ctx context.Context, clientset kubernetes.Interface, factory *kube.Factory, agentName string, command []string, stdinPayload []byte, tty bool, sizeQueue remotecommand.TerminalSizeQueue) (string, string, error) {
		stdin := string(stdinPayload)
		switch {
		case strings.Contains(stdin, "/auth/check"):
			calls = append(calls, "wait-model-api")
		case strings.Contains(stdin, "ai-agent-switch provider init"):
			calls = append(calls, "model-sync")
		case strings.Contains(stdin, "bootstrap.sh"):
			calls = append(calls, "bootstrap")
		case strings.Contains(stdin, "healthcheck.sh"):
			calls = append(calls, "healthcheck")
		default:
			calls = append(calls, stdin)
		}
		return "", "", nil
	}

	if err := runAgentBootstrapLifecycle(context.Background(), factory, config.Config{Region: "us"}, templateDef, spec); err != nil {
		t.Fatalf("runAgentBootstrapLifecycle() error = %v", err)
	}

	want := "bootstrap,wait-model-api,model-sync,healthcheck"
	if got := strings.Join(calls, ","); got != want {
		t.Fatalf("exec order = %s, want %s", got, want)
	}
}

func fakeBootstrapDynamicClient(t *testing.T, namespace, name string) dynamic.Interface {
	t.Helper()
	devbox := &unstructured.Unstructured{Object: map[string]any{
		"apiVersion": "devbox.sealos.io/v1alpha2",
		"kind":       "Devbox",
		"metadata": map[string]any{
			"name":      name,
			"namespace": namespace,
			"labels": map[string]any{
				"agent.sealos.io/name":       name,
				"agent.sealos.io/managed-by": kube.ManagedByValue(),
			},
			"annotations": map[string]any{
				"agent.sealos.io/template-id":     "cowagent",
				"agent.sealos.io/model-provider":  "custom:aiproxy-chat",
				"agent.sealos.io/model-baseurl":   "https://aiproxy.usw-1.sealos.io/v1",
				"agent.sealos.io/model":           "glm-5.1",
				"agent.sealos.io/model-slots":     `{"main":{"provider":"custom:aiproxy-chat","model":"glm-5.1","apiMode":"chat_completions","kind":"llm"},"vision":{"provider":"custom:aiproxy-chat","model":"gpt-5.4-mini","apiMode":"chat_completions","kind":"llm"}}`,
				"agent.sealos.io/bootstrap-phase": "pending",
			},
		},
		"spec": map[string]any{
			"config": map[string]any{
				"env": []any{
					map[string]any{"name": "AGENT_MODEL_APIKEY", "value": "sk-test"},
				},
			},
		},
	}}
	devbox.SetGroupVersionKind(schema.GroupVersionKind{Group: "devbox.sealos.io", Version: "v1alpha2", Kind: "Devbox"})
	client := dynamicfake.NewSimpleDynamicClientWithCustomListKinds(
		runtime.NewScheme(),
		map[schema.GroupVersionResource]string{
			kube.ResourceGVR(): "DevboxList",
		},
	)
	repo := kube.NewRepository(client, namespace)
	if _, err := repo.Create(context.Background(), devbox); err != nil {
		t.Fatalf("repo.Create() error = %v", err)
	}
	return client
}

func TestRunAgentBootstrapLifecycleFailsWhenInitialModelSyncFails(t *testing.T) {
	factory, appErr := kube.NewFactoryFromEncodedKubeconfig(testEncodedKubeconfig())
	if appErr != nil {
		t.Fatalf("NewFactoryFromEncodedKubeconfig() error = %v", appErr)
	}

	clientset := fake.NewSimpleClientset(&corev1.Pod{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "demo-agent-0",
			Namespace: factory.Namespace(),
			Labels: map[string]string{
				"agent.sealos.io/name":       "demo-agent",
				"agent.sealos.io/managed-by": kube.ManagedByValue(),
			},
		},
		Spec: corev1.PodSpec{Containers: []corev1.Container{{Name: "agent"}}},
		Status: corev1.PodStatus{
			Phase: corev1.PodRunning,
			ContainerStatuses: []corev1.ContainerStatus{{
				Name:  "agent",
				Ready: true,
			}},
		},
	})
	dynamicClient := fakeBootstrapDynamicClient(t, factory.Namespace(), "demo-agent")

	templateDef := testModelSyncIntegrationTemplate()
	templateDef.Bootstrap = agenttemplate.ScriptSpec{Script: "bootstrap.sh", TimeoutSeconds: 30}
	templateDef.Healthcheck = agenttemplate.ScriptSpec{Script: "healthcheck.sh", TimeoutSeconds: 30}

	spec := agent.Agent{
		Name:          "demo-agent",
		TemplateID:    "cowagent",
		ModelProvider: aiproxyChatProvider,
		ModelBaseURL:  "https://aiproxy.usw-1.sealos.io/v1",
		ModelAPIKey:   "sk-test",
		Model:         "glm-5.1",
		Annotations: map[string]string{
			"agent.sealos.io/model-slots": `{"main":{"provider":"custom:aiproxy-chat","model":"glm-5.1","apiMode":"chat_completions","kind":"llm"}}`,
		},
	}

	previousKubernetes := bootstrapKubernetesClient
	previousDynamic := bootstrapDynamicClient
	previousExec := execAgentCommandWithRetry
	previousRead := readTemplateScriptFile
	defer func() {
		bootstrapKubernetesClient = previousKubernetes
		bootstrapDynamicClient = previousDynamic
		execAgentCommandWithRetry = previousExec
		readTemplateScriptFile = previousRead
	}()

	bootstrapKubernetesClient = func(*kube.Factory) (kubernetes.Interface, error) { return clientset, nil }
	bootstrapDynamicClient = func(*kube.Factory) (dynamic.Interface, error) { return dynamicClient, nil }
	readTemplateScriptFile = func(scriptName, scriptPath string) ([]byte, error) { return []byte("echo " + scriptName), nil }
	execAgentCommandWithRetry = func(ctx context.Context, clientset kubernetes.Interface, factory *kube.Factory, agentName string, command []string, stdinPayload []byte, tty bool, sizeQueue remotecommand.TerminalSizeQueue) (string, string, error) {
		if strings.Contains(string(stdinPayload), "ai-agent-switch provider init") {
			return "", "provider init failed", errors.New("exec failed")
		}
		return "", "", nil
	}

	err := runAgentBootstrapLifecycle(context.Background(), factory, config.Config{Region: "us"}, templateDef, spec)
	if err == nil {
		t.Fatal("runAgentBootstrapLifecycle() error = nil, want model sync failure")
	}
	if !strings.Contains(err.Error(), "sync bootstrap model config") {
		t.Fatalf("error = %v, want sync bootstrap model config", err)
	}

	repo := kube.NewRepository(dynamicClient, factory.Namespace())
	devbox, getErr := repo.Get(context.Background(), "demo-agent")
	if getErr != nil {
		t.Fatalf("repo.Get() error = %v", getErr)
	}
	if got := kube.BootstrapPhase(devbox); got != kube.BootstrapPhaseFailed {
		t.Fatalf("bootstrap phase = %q, want failed", got)
	}
	if got := kube.BootstrapMessage(devbox); !strings.Contains(got, "provider init failed") {
		t.Fatalf("bootstrap message = %q, want provider init failed", got)
	}
}
