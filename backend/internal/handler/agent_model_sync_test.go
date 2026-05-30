package handler

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/nightwhite/Agent-Hub/internal/agent"
	"github.com/nightwhite/Agent-Hub/internal/agenttemplate"
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

func TestHasModelUpdateIncludesModelSlots(t *testing.T) {
	t.Parallel()

	if !hasModelUpdate(dto.UpdateAgentRequest{
		ModelSlots: map[string]dto.ModelSlotSelection{
			"main": {Provider: aiproxyChatProvider, Model: "glm-5.1", APIMode: "chat_completions"},
		},
	}) {
		t.Fatal("hasModelUpdate() = false for modelSlots update, want true")
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
	}, testModelSyncTemplate(), "us")
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

func TestBuildAgentModelSyncInputUsesTemplateModelList(t *testing.T) {
	t.Parallel()

	current := agent.Agent{
		Name:          "demo-agent",
		TemplateID:    "openclaw",
		ModelProvider: aiproxyChatProvider,
		ModelBaseURL:  "https://aiproxy.usw-1.sealos.io/v1",
		ModelAPIKey:   "sk-test",
		Model:         "glm-5.1",
		ModelAPIMode:  "chat_completions",
		Annotations: map[string]string{
			"agent.sealos.io/model-slots": `{"main":{"provider":"custom:aiproxy-chat","model":"glm-5.1","apiMode":"chat_completions"}}`,
		},
	}
	templateDef := agenttemplate.Definition{
		ModelIntegration: agenttemplate.ModelIntegration{
			Type:   "ai-agent-switch",
			Client: "openclaw",
			Provider: agenttemplate.ModelIntegrationProvider{
				ID:        "aiproxy",
				APIKeyEnv: "AGENT_MODEL_APIKEY",
			},
			Slots: []agenttemplate.ModelIntegrationSlot{
				{Key: "main", Required: true},
			},
		},
		RegionModelPresets: map[string][]agenttemplate.ModelPreset{
			"cn": {
				{Value: "glm-5.1", Provider: aiproxyChatProvider, APIMode: "chat_completions"},
				{Value: "kimi-k2.6", Provider: aiproxyChatProvider, APIMode: "chat_completions"},
				{Value: "deepseek-v4-pro", Provider: aiproxyChatProvider, APIMode: "chat_completions"},
				{Value: "deepseek-v4-flash", Provider: aiproxyChatProvider, APIMode: "chat_completions"},
			},
		},
	}

	input, err := buildAgentModelSyncInput(current, dto.UpdateAgentRequest{}, templateDef, "cn")
	if err != nil {
		t.Fatalf("buildAgentModelSyncInput() error = %v", err)
	}
	want := []string{
		"glm-5.1:chat_completions",
		"kimi-k2.6:chat_completions",
		"deepseek-v4-pro:chat_completions",
		"deepseek-v4-flash:chat_completions",
	}
	if strings.Join(input.Models, ",") != strings.Join(want, ",") {
		t.Fatalf("Models = %#v, want %#v", input.Models, want)
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
	}, dto.UpdateAgentRequest{}, testModelSyncTemplate(), "us")
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
	}, testModelSyncTemplate(), "us")
	if err != nil {
		t.Fatalf("buildAgentModelSyncInput() error = %v", err)
	}
	if input.BaseURL != "https://aiproxy.usw-1.sealos.io/v1" {
		t.Fatalf("BaseURL = %q, want persisted normalized base URL", input.BaseURL)
	}
}

func TestBuildAgentModelSyncScriptUsesProviderInitThenClientConfigure(t *testing.T) {
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
		Models:       []string{"gpt-5.4-mini:codex_responses"},
		Slots: []agentModelSyncSlot{
			{Key: "main", ProviderID: "aiproxy", Model: "gpt-5.4-mini"},
		},
	})
	for _, want := range []string{
		"export AIPROXY_API_KEY='sk-test'",
		"ai-agent-switch provider init",
		"--id 'aiproxy'",
		"--model 'gpt-5.4-mini:codex_responses'",
		"--default-model 'gpt-5.4-mini'",
		"ai-agent-switch client configure",
		"--client 'hermes'",
		"--slot 'main=aiproxy/gpt-5.4-mini'",
	} {
		if !strings.Contains(script, want) {
			t.Fatalf("sync script does not contain %q:\n%s", want, script)
		}
	}
	if strings.Contains(script, "ai-agent-switch switch") {
		t.Fatalf("sync script contains deprecated switch command:\n%s", script)
	}
}

func TestBuildAgentModelSyncScriptIncludesAllCowAgentSlots(t *testing.T) {
	t.Parallel()

	script := buildAgentModelSyncScript(agentModelSyncInput{
		Client:       "cowagent",
		ProviderID:   "aiproxy",
		ProviderName: "AI Proxy",
		BaseURL:      "https://aiproxy.usw-1.sealos.io/v1",
		APIKeyEnv:    "OPEN_AI_API_KEY",
		APIKeyValue:  "sk-test",
		Model:        "glm-5.1",
		APIMode:      "chat_completions",
		Models: []string{
			"glm-5.1:chat_completions",
			"qwen3.6-plus:chat_completions",
			"qwen-image-2.0-pro:openai_compatible",
			"qwen3-asr-flash:openai_compatible",
			"qwen3-tts-flash:openai_compatible",
			"text-embedding-v4:openai_compatible",
		},
		Slots: []agentModelSyncSlot{
			{Key: "main", ProviderID: "aiproxy", Model: "glm-5.1"},
			{Key: "vision", ProviderID: "aiproxy", Model: "qwen3.6-plus"},
			{Key: "image", ProviderID: "aiproxy", Model: "qwen-image-2.0-pro"},
			{Key: "asr", ProviderID: "aiproxy", Model: "qwen3-asr-flash"},
			{Key: "tts", ProviderID: "aiproxy", Model: "qwen3-tts-flash"},
			{Key: "embedding", ProviderID: "aiproxy", Model: "text-embedding-v4"},
		},
	})
	for _, want := range []string{
		"export OPEN_AI_API_KEY='sk-test'",
		"--model 'qwen-image-2.0-pro:openai_compatible'",
		"--default-model 'glm-5.1'",
		"--client 'cowagent'",
		"--slot 'main=aiproxy/glm-5.1'",
		"--slot 'vision=aiproxy/qwen3.6-plus'",
		"--slot 'image=aiproxy/qwen-image-2.0-pro'",
		"--slot 'asr=aiproxy/qwen3-asr-flash'",
		"--slot 'tts=aiproxy/qwen3-tts-flash'",
		"--slot 'embedding=aiproxy/text-embedding-v4'",
	} {
		if !strings.Contains(script, want) {
			t.Fatalf("sync script does not contain %q:\n%s", want, script)
		}
	}
}

func TestBuildAgentModelSyncScriptQuotesShellArguments(t *testing.T) {
	t.Parallel()

	script := buildAgentModelSyncScript(agentModelSyncInput{
		Client:       "client with space",
		ProviderID:   "aiproxy",
		ProviderName: "AI Proxy's",
		BaseURL:      "https://example.test/v1?name=two words",
		APIKeyEnv:    "AIPROXY_API_KEY",
		APIKeyValue:  "sk 'test",
		Model:        "gpt model",
		Models:       []string{"gpt model:chat_completions"},
		Slots: []agentModelSyncSlot{
			{Key: "main", ProviderID: "aiproxy", Model: "gpt model"},
		},
	})
	for _, want := range []string{
		"export AIPROXY_API_KEY='sk '\"'\"'test'",
		"--name 'AI Proxy'\"'\"'s'",
		"--base-url 'https://example.test/v1?name=two words'",
		"--model 'gpt model:chat_completions'",
		"--client 'client with space'",
		"--slot 'main=aiproxy/gpt model'",
	} {
		if !strings.Contains(script, want) {
			t.Fatalf("sync script does not contain %q:\n%s", want, script)
		}
	}
}

func TestSyncAgentModelConfigExecutesClientConfigureCommand(t *testing.T) {
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

	err := syncAgentModelConfig(context.Background(), fake.NewSimpleClientset(), factory, agent.Agent{
		Name:          "demo-agent",
		TemplateID:    "hermes-agent",
		ModelProvider: aiproxyAnthropicProvider,
		ModelBaseURL:  "https://aiproxy.usw-1.sealos.io/anthropic",
		ModelAPIKey:   "sk-test",
		Model:         "glm-5.1",
		Annotations: map[string]string{
			"agent.sealos.io/model-slots": `{"main":{"provider":"custom:aiproxy-anthropic","model":"claude-opus-4-7","apiMode":"anthropic_messages"},"vision":{"provider":"custom:aiproxy-chat","model":"glm-5.1","apiMode":"chat_completions"}}`,
		},
	}, dto.UpdateAgentRequest{
		ModelSlots: map[string]dto.ModelSlotSelection{
			"main":   {Provider: aiproxyAnthropicProvider, Model: "claude-opus-4-7", APIMode: "anthropic_messages"},
			"vision": {Provider: aiproxyChatProvider, Model: "glm-5.1", APIMode: "chat_completions"},
		},
	}, testModelSyncIntegrationTemplate(), "us")
	if err != nil {
		t.Fatalf("syncAgentModelConfig() error = %v", err)
	}
	if gotAgentName != "demo-agent" {
		t.Fatalf("agentName = %q, want demo-agent", gotAgentName)
	}
	if len(gotCommand) != 2 || gotCommand[0] != "sh" || gotCommand[1] != "-s" {
		t.Fatalf("command = %#v, want sh -s", gotCommand)
	}
	stdin := string(gotStdin)
	for _, want := range []string{
		"--model 'glm-5.1:chat_completions'",
		"--model 'gpt-5.4-mini:codex_responses'",
		"--model 'claude-opus-4-7:anthropic_messages'",
		"--name 'AI Proxy'",
		"--default-model 'claude-opus-4-7'",
		"ai-agent-switch client configure",
		"--client 'cowagent'",
		"--slot 'main=aiproxy/claude-opus-4-7'",
		"--slot 'vision=aiproxy/glm-5.1'",
	} {
		if !strings.Contains(stdin, want) {
			t.Fatalf("stdin = %q, want %q", stdin, want)
		}
	}
	if strings.Contains(stdin, "ai-agent-switch switch") {
		t.Fatalf("stdin contains deprecated switch command: %q", stdin)
	}
}

func TestSyncAgentModelConfigSupportsLegacyTemplateWithoutModelPresets(t *testing.T) {
	factory, appErr := kube.NewFactoryFromEncodedKubeconfig(testEncodedKubeconfig())
	if appErr != nil {
		t.Fatalf("NewFactoryFromEncodedKubeconfig() error = %v", appErr)
	}

	var gotStdin []byte
	previous := execAgentCommandWithRetry
	execAgentCommandWithRetry = func(ctx context.Context, clientset kubernetes.Interface, factory *kube.Factory, agentName string, command []string, stdinPayload []byte, tty bool, sizeQueue remotecommand.TerminalSizeQueue) (string, string, error) {
		gotStdin = append([]byte(nil), stdinPayload...)
		return "", "", nil
	}
	defer func() {
		execAgentCommandWithRetry = previous
	}()

	model := "gpt-5.4-mini"
	apiMode := "codex_responses"
	err := syncAgentModelConfig(context.Background(), fake.NewSimpleClientset(), factory, agent.Agent{
		Name:          "demo-agent",
		TemplateID:    "openclaw",
		ModelProvider: aiproxyResponsesProvider,
		ModelBaseURL:  "https://aiproxy.usw-1.sealos.io/v1",
		ModelAPIKey:   "sk-test",
		Model:         "glm-5.1",
		ModelAPIMode:  "chat_completions",
	}, dto.UpdateAgentRequest{
		Model:        &model,
		ModelAPIMode: &apiMode,
	}, agenttemplate.Definition{}, "us")
	if err != nil {
		t.Fatalf("syncAgentModelConfig() error = %v, want nil", err)
	}
	stdin := string(gotStdin)
	for _, want := range []string{
		"ai-agent-switch provider init",
		"--model 'gpt-5.4-mini:codex_responses'",
		"--default-model 'gpt-5.4-mini'",
		"ai-agent-switch client configure",
		"--client 'openclaw'",
		"--slot 'main=aiproxy/gpt-5.4-mini'",
	} {
		if !strings.Contains(stdin, want) {
			t.Fatalf("stdin = %q, want %q", stdin, want)
		}
	}
}

func TestSyncAgentModelConfigReturnsValidationErrorForInvalidAPIKeyEnv(t *testing.T) {
	for _, apiKeyEnv := range []string{"BAD-NAME", "A;echo bad"} {
		t.Run(apiKeyEnv, func(t *testing.T) {
			factory, appErr := kube.NewFactoryFromEncodedKubeconfig(testEncodedKubeconfig())
			if appErr != nil {
				t.Fatalf("NewFactoryFromEncodedKubeconfig() error = %v", appErr)
			}

			previous := execAgentCommandWithRetry
			called := false
			execAgentCommandWithRetry = func(ctx context.Context, clientset kubernetes.Interface, factory *kube.Factory, agentName string, command []string, stdinPayload []byte, tty bool, sizeQueue remotecommand.TerminalSizeQueue) (string, string, error) {
				called = true
				return "", "", nil
			}
			defer func() {
				execAgentCommandWithRetry = previous
			}()

			templateDef := testModelSyncIntegrationTemplate()
			templateDef.ModelIntegration.Provider.APIKeyEnv = apiKeyEnv
			err := syncAgentModelConfig(context.Background(), fake.NewSimpleClientset(), factory, agent.Agent{
				Name:          "demo-agent",
				TemplateID:    "cowagent",
				ModelProvider: aiproxyChatProvider,
				ModelBaseURL:  "https://aiproxy.usw-1.sealos.io/v1",
				ModelAPIKey:   "sk-test",
				Model:         "glm-5.1",
				Annotations: map[string]string{
					"agent.sealos.io/model-slots": `{"main":{"provider":"custom:aiproxy-chat","model":"glm-5.1","apiMode":"chat_completions"}}`,
				},
			}, dto.UpdateAgentRequest{
				ModelSlots: map[string]dto.ModelSlotSelection{
					"main": {Provider: aiproxyChatProvider, Model: "glm-5.1", APIMode: "chat_completions"},
				},
			}, templateDef, "us")
			if err == nil {
				t.Fatal("syncAgentModelConfig() error = nil, want validation error")
			}
			if err.Code() != apperrors.CodeValidationFailed {
				t.Fatalf("syncAgentModelConfig() code = %d, want %d", err.Code(), apperrors.CodeValidationFailed)
			}
			if called {
				t.Fatal("exec called despite invalid apiKeyEnv")
			}
		})
	}
}

func TestSyncAgentModelConfigRequiresModelIntegrationAPIKeyEnv(t *testing.T) {
	factory, appErr := kube.NewFactoryFromEncodedKubeconfig(testEncodedKubeconfig())
	if appErr != nil {
		t.Fatalf("NewFactoryFromEncodedKubeconfig() error = %v", appErr)
	}

	previous := execAgentCommandWithRetry
	called := false
	execAgentCommandWithRetry = func(ctx context.Context, clientset kubernetes.Interface, factory *kube.Factory, agentName string, command []string, stdinPayload []byte, tty bool, sizeQueue remotecommand.TerminalSizeQueue) (string, string, error) {
		called = true
		return "", "", nil
	}
	defer func() {
		execAgentCommandWithRetry = previous
	}()

	templateDef := testModelSyncIntegrationTemplate()
	templateDef.ModelIntegration.Provider.APIKeyEnv = ""
	err := syncAgentModelConfig(context.Background(), fake.NewSimpleClientset(), factory, agent.Agent{
		Name:          "demo-agent",
		TemplateID:    "cowagent",
		ModelProvider: aiproxyChatProvider,
		ModelBaseURL:  "https://aiproxy.usw-1.sealos.io/v1",
		ModelAPIKey:   "sk-test",
		Model:         "glm-5.1",
		Annotations: map[string]string{
			"agent.sealos.io/model-slots": `{"main":{"provider":"custom:aiproxy-chat","model":"glm-5.1","apiMode":"chat_completions"}}`,
		},
	}, dto.UpdateAgentRequest{
		ModelSlots: map[string]dto.ModelSlotSelection{
			"main": {Provider: aiproxyChatProvider, Model: "glm-5.1", APIMode: "chat_completions"},
		},
	}, templateDef, "us")
	if err == nil {
		t.Fatal("syncAgentModelConfig() error = nil, want validation error")
	}
	if err.Code() != apperrors.CodeValidationFailed {
		t.Fatalf("syncAgentModelConfig() code = %d, want %d", err.Code(), apperrors.CodeValidationFailed)
	}
	if got := err.Details()["reason"]; got != "modelIntegration.provider.apiKeyEnv is required" {
		t.Fatalf("syncAgentModelConfig() reason = %v, want apiKeyEnv required", got)
	}
	if called {
		t.Fatal("exec called despite missing apiKeyEnv")
	}
}

func TestSyncAgentModelConfigReturnsValidationErrorForMissingProviderModelsWithModelIntegration(t *testing.T) {
	factory, appErr := kube.NewFactoryFromEncodedKubeconfig(testEncodedKubeconfig())
	if appErr != nil {
		t.Fatalf("NewFactoryFromEncodedKubeconfig() error = %v", appErr)
	}

	previous := execAgentCommandWithRetry
	called := false
	execAgentCommandWithRetry = func(ctx context.Context, clientset kubernetes.Interface, factory *kube.Factory, agentName string, command []string, stdinPayload []byte, tty bool, sizeQueue remotecommand.TerminalSizeQueue) (string, string, error) {
		called = true
		return "", "", nil
	}
	defer func() {
		execAgentCommandWithRetry = previous
	}()

	templateDef := testModelSyncIntegrationTemplate()
	templateDef.RegionModelPresets = map[string][]agenttemplate.ModelPreset{
		"us": {
			{Value: "other-model", Provider: "custom:other", APIMode: "chat_completions"},
		},
	}
	err := syncAgentModelConfig(context.Background(), fake.NewSimpleClientset(), factory, agent.Agent{
		Name:          "demo-agent",
		TemplateID:    "cowagent",
		ModelProvider: aiproxyChatProvider,
		ModelBaseURL:  "https://aiproxy.usw-1.sealos.io/v1",
		ModelAPIKey:   "sk-test",
		Model:         "glm-5.1",
		Annotations: map[string]string{
			"agent.sealos.io/model-slots": `{"main":{"provider":"custom:aiproxy-chat","model":"glm-5.1","apiMode":"chat_completions"}}`,
		},
	}, dto.UpdateAgentRequest{
		ModelSlots: map[string]dto.ModelSlotSelection{
			"main": {Provider: aiproxyChatProvider, Model: "glm-5.1", APIMode: "chat_completions"},
		},
	}, templateDef, "us")
	if err == nil {
		t.Fatal("syncAgentModelConfig() error = nil, want validation error")
	}
	if err.Code() != apperrors.CodeValidationFailed {
		t.Fatalf("syncAgentModelConfig() code = %d, want %d", err.Code(), apperrors.CodeValidationFailed)
	}
	if called {
		t.Fatal("exec called despite missing provider models")
	}
}

func TestSyncAgentModelConfigReturnsValidationErrorForMissingSlotsWithModelIntegration(t *testing.T) {
	factory, appErr := kube.NewFactoryFromEncodedKubeconfig(testEncodedKubeconfig())
	if appErr != nil {
		t.Fatalf("NewFactoryFromEncodedKubeconfig() error = %v", appErr)
	}

	previous := execAgentCommandWithRetry
	called := false
	execAgentCommandWithRetry = func(ctx context.Context, clientset kubernetes.Interface, factory *kube.Factory, agentName string, command []string, stdinPayload []byte, tty bool, sizeQueue remotecommand.TerminalSizeQueue) (string, string, error) {
		called = true
		return "", "", nil
	}
	defer func() {
		execAgentCommandWithRetry = previous
	}()

	model := "claude-opus-4-7"
	err := syncAgentModelConfig(context.Background(), fake.NewSimpleClientset(), factory, agent.Agent{
		Name:          "demo-agent",
		TemplateID:    "cowagent",
		ModelProvider: aiproxyAnthropicProvider,
		ModelBaseURL:  "https://aiproxy.usw-1.sealos.io/anthropic",
		ModelAPIKey:   "sk-test",
		Model:         "glm-5.1",
	}, dto.UpdateAgentRequest{
		Model: &model,
	}, testModelSyncIntegrationTemplate(), "us")
	if err == nil {
		t.Fatal("syncAgentModelConfig() error = nil, want validation error")
	}
	if err.Code() != apperrors.CodeValidationFailed {
		t.Fatalf("syncAgentModelConfig() code = %d, want %d", err.Code(), apperrors.CodeValidationFailed)
	}
	if called {
		t.Fatal("exec called despite missing model slots annotation")
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
	}, testModelSyncTemplate(), "us")
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
	}, testModelSyncTemplate(), "us")
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
	}, testModelSyncTemplate(), "us")
	if err == nil {
		t.Fatal("syncAgentModelConfig() error = nil, want validation error")
	}
	if err.Code() != apperrors.CodeValidationFailed {
		t.Fatalf("syncAgentModelConfig() code = %d, want %d", err.Code(), apperrors.CodeValidationFailed)
	}
}

func testModelSyncTemplate() agenttemplate.Definition {
	return agenttemplate.Definition{
		RegionModelPresets: map[string][]agenttemplate.ModelPreset{
			"us": {
				{Value: "glm-5.1", Provider: aiproxyChatProvider, APIMode: "chat_completions"},
				{Value: "gpt-5.4-mini", Provider: aiproxyResponsesProvider, APIMode: "codex_responses"},
				{Value: "claude-opus-4-7", Provider: aiproxyAnthropicProvider, APIMode: "anthropic_messages"},
			},
		},
	}
}

func testModelSyncIntegrationTemplate() agenttemplate.Definition {
	templateDef := testModelSyncTemplate()
	templateDef.ModelIntegration = agenttemplate.ModelIntegration{
		Type:   "ai-agent-switch",
		Client: "cowagent",
		Provider: agenttemplate.ModelIntegrationProvider{
			ID:        "aiproxy",
			Name:      agenttemplate.LocalizedText{"en": "AI Proxy", "zh": "AI Proxy"},
			APIKeyEnv: "AGENT_MODEL_APIKEY",
		},
		Slots: []agenttemplate.ModelIntegrationSlot{
			{Key: "main", Required: true},
			{Key: "vision", Required: false},
		},
	}
	return templateDef
}
