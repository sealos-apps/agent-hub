package handler

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/nightwhite/Agent-Hub/internal/agent"
	"github.com/nightwhite/Agent-Hub/internal/dto"
	"github.com/nightwhite/Agent-Hub/internal/kube"
	apperrors "github.com/nightwhite/Agent-Hub/pkg/errors"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/kubernetes/fake"
	"k8s.io/client-go/tools/remotecommand"
)

func TestShouldRebootstrapIgnoresModelOnlyUpdate(t *testing.T) {
	t.Parallel()

	model := "gpt-5.4-mini"
	if shouldRebootstrap(dto.UpdateAgentRequest{Model: &model}) {
		t.Fatal("shouldRebootstrap() = true for model-only update, want false")
	}
	if !shouldRebootstrap(dto.UpdateAgentRequest{Rebootstrap: true}) {
		t.Fatal("shouldRebootstrap() = false for explicit rebootstrap, want true")
	}
}

func TestBuildAgentModelSyncInputUsesUnifiedAIProxyProvider(t *testing.T) {
	t.Parallel()

	current := agent.Agent{
		Name:          "demo-agent",
		TemplateID:    "openclaw",
		ModelProvider: aiproxyChatProvider,
		ModelBaseURL:  "https://aiproxy.usw-1.sealos.io/v1",
		ModelAPIKey:   "sk-test",
		Model:         "glm-5.1",
		ModelAPIMode:  "chat_completions",
	}
	provider := aiproxyResponsesProvider
	model := "gpt-5.4-mini"
	apiMode := "codex_responses"

	input, err := buildAgentModelSyncInput(current, dto.UpdateAgentRequest{
		ModelProvider: &provider,
		Model:         &model,
		ModelAPIMode:  &apiMode,
	})
	if err != nil {
		t.Fatalf("buildAgentModelSyncInput() error = %v", err)
	}
	if input.Client != "openclaw" {
		t.Fatalf("Client = %q, want openclaw", input.Client)
	}
	if input.ProviderID != "aiproxy" {
		t.Fatalf("ProviderID = %q, want aiproxy", input.ProviderID)
	}
	if input.ProviderName != "AI Proxy" {
		t.Fatalf("ProviderName = %q, want AI Proxy", input.ProviderName)
	}
	if input.APIKeyEnv != aiproxyAPIKeyEnv {
		t.Fatalf("APIKeyEnv = %q, want %s", input.APIKeyEnv, aiproxyAPIKeyEnv)
	}
	if input.APIKeyValue != "sk-test" {
		t.Fatalf("APIKeyValue = %q, want sk-test", input.APIKeyValue)
	}
	if input.APIMode != "codex_responses" {
		t.Fatalf("APIMode = %q, want codex_responses", input.APIMode)
	}
}

func TestBuildAgentModelSyncInputUsesCowAgentOpenAIKeyEnv(t *testing.T) {
	t.Parallel()

	input, err := buildAgentModelSyncInput(agent.Agent{
		Name:          "demo-agent",
		TemplateID:    "cowagent",
		ModelProvider: aiproxyChatProvider,
		ModelBaseURL:  "https://aiproxy.usw-1.sealos.io/v1",
		ModelAPIKey:   "sk-test",
		Model:         "glm-5.1",
	}, dto.UpdateAgentRequest{})
	if err != nil {
		t.Fatalf("buildAgentModelSyncInput() error = %v", err)
	}
	if input.APIKeyEnv != "OPEN_AI_API_KEY" {
		t.Fatalf("APIKeyEnv = %q, want OPEN_AI_API_KEY", input.APIKeyEnv)
	}
	if input.Client != "cowagent" {
		t.Fatalf("Client = %q, want cowagent", input.Client)
	}
}

func TestBuildAgentModelSyncInputUsesPersistedBaseURL(t *testing.T) {
	t.Parallel()

	rawBaseURL := "https://aiproxy.usw-1.sealos.io"
	input, err := buildAgentModelSyncInput(agent.Agent{
		Name:          "demo-agent",
		TemplateID:    "openclaw",
		ModelProvider: aiproxyResponsesProvider,
		ModelBaseURL:  "https://aiproxy.usw-1.sealos.io/v1",
		ModelAPIKey:   "sk-test",
		Model:         "gpt-5.4-mini",
	}, dto.UpdateAgentRequest{
		ModelBaseURL: &rawBaseURL,
	})
	if err != nil {
		t.Fatalf("buildAgentModelSyncInput() error = %v", err)
	}
	if input.BaseURL != "https://aiproxy.usw-1.sealos.io/v1" {
		t.Fatalf("BaseURL = %q, want persisted normalized base URL", input.BaseURL)
	}
}

func TestBuildAgentModelSyncScriptUsesProviderInitThenSwitch(t *testing.T) {
	t.Parallel()

	script := buildAgentModelSyncScript(agentModelSyncInput{
		Client:       "hermes",
		ProviderID:   "aiproxy",
		ProviderName: "AI Proxy",
		BaseURL:      "https://aiproxy.usw-1.sealos.io/v1",
		APIKeyEnv:    aiproxyAPIKeyEnv,
		APIKeyValue:  "sk-test",
		Model:        "gpt-5.4-mini",
		APIMode:      "codex_responses",
	})
	for _, want := range []string{
		"export AIPROXY_API_KEY='sk-test'",
		"ai-agent-switch provider init",
		"--id 'aiproxy'",
		"--model 'gpt-5.4-mini:codex_responses'",
		"--default-model 'gpt-5.4-mini'",
		"ai-agent-switch switch",
		"--client 'hermes'",
		"--provider 'aiproxy'",
		"--model 'gpt-5.4-mini'",
	} {
		if !strings.Contains(script, want) {
			t.Fatalf("sync script does not contain %q:\n%s", want, script)
		}
	}
}

func TestSyncAgentModelConfigExecutesSwitchCommand(t *testing.T) {
	factory, appErr := kube.NewFactoryFromEncodedKubeconfig(testEncodedKubeconfig())
	if appErr != nil {
		t.Fatalf("NewFactoryFromEncodedKubeconfig() error = %v", appErr)
	}

	var gotAgentName string
	var gotCommand []string
	var gotStdin []byte
	previous := execAgentCommandWithRetry
	execAgentCommandWithRetry = func(ctx context.Context, clientset kubernetes.Interface, factory *kube.Factory, agentName string, command []string, stdinPayload []byte, tty bool, sizeQueue remotecommand.TerminalSizeQueue) (string, string, error) {
		gotAgentName = agentName
		gotCommand = append([]string(nil), command...)
		gotStdin = append([]byte(nil), stdinPayload...)
		return "", "", nil
	}
	defer func() {
		execAgentCommandWithRetry = previous
	}()

	model := "claude-opus-4-7"
	apiMode := "anthropic_messages"
	err := syncAgentModelConfig(context.Background(), fake.NewSimpleClientset(), factory, agent.Agent{
		Name:          "demo-agent",
		TemplateID:    "hermes-agent",
		ModelProvider: aiproxyAnthropicProvider,
		ModelBaseURL:  "https://aiproxy.usw-1.sealos.io/anthropic",
		ModelAPIKey:   "sk-test",
		Model:         "glm-5.1",
	}, dto.UpdateAgentRequest{
		Model:        &model,
		ModelAPIMode: &apiMode,
	})
	if err != nil {
		t.Fatalf("syncAgentModelConfig() error = %v", err)
	}
	if gotAgentName != "demo-agent" {
		t.Fatalf("agentName = %q, want demo-agent", gotAgentName)
	}
	if len(gotCommand) != 2 || gotCommand[0] != "sh" || gotCommand[1] != "-s" {
		t.Fatalf("command = %#v, want sh -s", gotCommand)
	}
	if !strings.Contains(string(gotStdin), "--client 'hermes'") || !strings.Contains(string(gotStdin), "--model 'claude-opus-4-7'") {
		t.Fatalf("stdin = %q, want hermes switch for claude model", string(gotStdin))
	}
}

func TestSyncAgentModelConfigReturnsExecError(t *testing.T) {
	factory, appErr := kube.NewFactoryFromEncodedKubeconfig(testEncodedKubeconfig())
	if appErr != nil {
		t.Fatalf("NewFactoryFromEncodedKubeconfig() error = %v", appErr)
	}

	previous := execAgentCommandWithRetry
	execAgentCommandWithRetry = func(ctx context.Context, clientset kubernetes.Interface, factory *kube.Factory, agentName string, command []string, stdinPayload []byte, tty bool, sizeQueue remotecommand.TerminalSizeQueue) (string, string, error) {
		return "", "switch failed", errors.New("exec failed")
	}
	defer func() {
		execAgentCommandWithRetry = previous
	}()

	model := "gpt-5.4-mini"
	err := syncAgentModelConfig(context.Background(), fake.NewSimpleClientset(), factory, agent.Agent{
		Name:          "demo-agent",
		TemplateID:    "openclaw",
		ModelProvider: aiproxyResponsesProvider,
		ModelBaseURL:  "https://aiproxy.usw-1.sealos.io/v1",
		ModelAPIKey:   "sk-test",
		Model:         "glm-5.1",
	}, dto.UpdateAgentRequest{
		Model: &model,
	})
	if err == nil {
		t.Fatal("syncAgentModelConfig() error = nil, want exec error")
	}
	if got := err.Details()["stderr"]; got != "switch failed" {
		t.Fatalf("stderr detail = %#v, want switch failed", got)
	}
}

func TestSyncAgentModelConfigSkipsExplicitRebootstrap(t *testing.T) {
	factory, appErr := kube.NewFactoryFromEncodedKubeconfig(testEncodedKubeconfig())
	if appErr != nil {
		t.Fatalf("NewFactoryFromEncodedKubeconfig() error = %v", appErr)
	}

	called := false
	previous := execAgentCommandWithRetry
	execAgentCommandWithRetry = func(ctx context.Context, clientset kubernetes.Interface, factory *kube.Factory, agentName string, command []string, stdinPayload []byte, tty bool, sizeQueue remotecommand.TerminalSizeQueue) (string, string, error) {
		called = true
		return "", "", nil
	}
	defer func() {
		execAgentCommandWithRetry = previous
	}()

	model := "gpt-5.4-mini"
	err := syncAgentModelConfig(context.Background(), fake.NewSimpleClientset(), factory, agent.Agent{
		Name:          "demo-agent",
		TemplateID:    "openclaw",
		ModelProvider: aiproxyResponsesProvider,
		ModelBaseURL:  "https://aiproxy.usw-1.sealos.io/v1",
		ModelAPIKey:   "sk-test",
		Model:         "glm-5.1",
	}, dto.UpdateAgentRequest{
		Model:       &model,
		Rebootstrap: true,
	})
	if err != nil {
		t.Fatalf("syncAgentModelConfig() error = %v, want nil", err)
	}
	if called {
		t.Fatal("exec called for explicit rebootstrap, want hot-sync skipped")
	}
}

func TestSyncAgentModelConfigReturnsValidationErrorForInvalidInput(t *testing.T) {
	factory, appErr := kube.NewFactoryFromEncodedKubeconfig(testEncodedKubeconfig())
	if appErr != nil {
		t.Fatalf("NewFactoryFromEncodedKubeconfig() error = %v", appErr)
	}

	model := "gpt-5.4-mini"
	err := syncAgentModelConfig(context.Background(), fake.NewSimpleClientset(), factory, agent.Agent{
		Name:         "demo-agent",
		TemplateID:   "openclaw",
		ModelBaseURL: "https://aiproxy.usw-1.sealos.io/v1",
		Model:        "glm-5.1",
	}, dto.UpdateAgentRequest{
		Model: &model,
	})
	if err == nil {
		t.Fatal("syncAgentModelConfig() error = nil, want validation error")
	}
	if err.Code() != apperrors.CodeValidationFailed {
		t.Fatalf("syncAgentModelConfig() code = %d, want %d", err.Code(), apperrors.CodeValidationFailed)
	}
}
