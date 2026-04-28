package router

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"github.com/nightwhite/Agent-Hub/internal/config"
)

type testEnvelope struct {
	Code      int            `json:"code"`
	Message   string         `json:"message"`
	RequestID string         `json:"requestId"`
	Error     *testErrorBody `json:"error"`
	Data      map[string]any `json:"data"`
}

type testErrorBody struct {
	Type    string         `json:"type"`
	Details map[string]any `json:"details"`
}

func TestHealthzReturnsStandardEnvelope(t *testing.T) {
	t.Parallel()

	recorder := performRequest(t, http.MethodGet, "/healthz", "", "", map[string]string{
		"X-Request-Id": "req-healthz",
	})

	if recorder.Code != http.StatusOK {
		t.Fatalf("GET /healthz status = %d, want %d", recorder.Code, http.StatusOK)
	}

	body := decodeEnvelope(t, recorder)
	if body.Code != 0 {
		t.Fatalf("GET /healthz code = %d, want 0", body.Code)
	}
	if body.Message != "ok" {
		t.Fatalf("GET /healthz message = %q, want ok", body.Message)
	}
	if body.RequestID != "req-healthz" {
		t.Fatalf("GET /healthz requestId = %q, want req-healthz", body.RequestID)
	}
	if status := body.Data["status"]; status != "ok" {
		t.Fatalf("GET /healthz data.status = %#v, want ok", status)
	}
}

func TestReadyzReturnsStandardEnvelope(t *testing.T) {
	t.Parallel()

	recorder := performRequest(t, http.MethodGet, "/readyz", "", "", nil)
	if recorder.Code != http.StatusOK {
		t.Fatalf("GET /readyz status = %d, want %d", recorder.Code, http.StatusOK)
	}

	body := decodeEnvelope(t, recorder)
	if body.Code != 0 || body.Message != "ok" {
		t.Fatalf("GET /readyz envelope = %#v, want code=0 message=ok", body)
	}
	if status := body.Data["status"]; status != "ready" {
		t.Fatalf("GET /readyz data.status = %#v, want ready", status)
	}
	checks, ok := body.Data["checks"].(map[string]any)
	if !ok {
		t.Fatalf("GET /readyz data.checks = %#v, want checks map", body.Data["checks"])
	}
	if checks["kubernetes"] != "request_scoped" {
		t.Fatalf("GET /readyz data.checks.kubernetes = %#v, want request_scoped", checks["kubernetes"])
	}
}

func TestSystemConfigReturnsRuntimeRegionWithoutAuthorization(t *testing.T) {
	t.Parallel()

	recorder := performRequestWithConfig(t, config.Config{
		Port:                "8080",
		IngressSuffix:       "agent.usw-1.sealos.app",
		APIServerImage:      "nousresearch/hermes-agent:latest",
		AIProxyModelBaseURL: "https://aiproxy.example.com/v1",
		Region:              "cn",
	}, http.MethodGet, "/api/v1/system/config", "", "", nil)

	if recorder.Code != http.StatusOK {
		t.Fatalf("GET /api/v1/system/config status = %d, want %d", recorder.Code, http.StatusOK)
	}

	body := decodeEnvelope(t, recorder)
	if body.Code != 0 || body.Message != "ok" {
		t.Fatalf("GET /api/v1/system/config envelope = %#v, want code=0 message=ok", body)
	}
	if body.Data["region"] != "cn" {
		t.Fatalf("GET /api/v1/system/config data.region = %#v, want cn", body.Data["region"])
	}
	if body.Data["aiProxyModelBaseURL"] != "https://aiproxy.example.com/v1" {
		t.Fatalf("GET /api/v1/system/config data.aiProxyModelBaseURL = %#v, want explicit value", body.Data["aiProxyModelBaseURL"])
	}
}

func TestListTemplatesReturnsRegionalCatalogWithoutAuthorization(t *testing.T) {
	t.Parallel()

	recorder := performRequestWithConfig(t, config.Config{
		Port:                "8080",
		IngressSuffix:       "agent.usw-1.sealos.app",
		APIServerImage:      "nousresearch/hermes-agent:latest",
		AIProxyModelBaseURL: "https://aiproxy.example.com/v1",
		Region:              "cn",
	}, http.MethodGet, "/api/v1/templates", "", "", nil)

	if recorder.Code != http.StatusOK {
		t.Fatalf("GET /api/v1/templates status = %d, want %d", recorder.Code, http.StatusOK)
	}

	body := decodeEnvelope(t, recorder)
	if body.Code != 0 || body.Message != "ok" {
		t.Fatalf("GET /api/v1/templates envelope = %#v, want code=0 message=ok", body)
	}
	if body.Data["region"] != "cn" {
		t.Fatalf("GET /api/v1/templates data.region = %#v, want cn", body.Data["region"])
	}

	items, ok := body.Data["items"].([]any)
	if !ok || len(items) == 0 {
		t.Fatalf("GET /api/v1/templates data.items = %#v, want non-empty list", body.Data["items"])
	}

	foundHermes := false
	for _, raw := range items {
		item, ok := raw.(map[string]any)
		if !ok || item["id"] != "hermes-agent" {
			continue
		}
		foundHermes = true

		modelOptions, ok := item["modelOptions"].([]any)
		if !ok || len(modelOptions) == 0 {
			t.Fatalf("hermes-agent modelOptions = %#v, want regional presets", item["modelOptions"])
		}

		for _, optionRaw := range modelOptions {
			option, ok := optionRaw.(map[string]any)
			if !ok {
				t.Fatalf("hermes-agent model option = %#v, want map", optionRaw)
			}
			if option["value"] == "gpt-5.4-mini" {
				t.Fatalf("cn catalog should not expose us-only model gpt-5.4-mini: %#v", modelOptions)
			}
		}
	}

	if !foundHermes {
		t.Fatal("GET /api/v1/templates did not return hermes-agent")
	}
}

func TestListTemplatesRejectsMissingRegion(t *testing.T) {
	t.Parallel()

	recorder := performRequestWithConfig(t, config.Config{
		Port:                "8080",
		IngressSuffix:       "agent.usw-1.sealos.app",
		APIServerImage:      "nousresearch/hermes-agent:latest",
		AIProxyModelBaseURL: "https://aiproxy.example.com/v1",
	}, http.MethodGet, "/api/v1/templates", "", "", nil)

	if recorder.Code != http.StatusInternalServerError {
		t.Fatalf("GET /api/v1/templates status = %d, want %d", recorder.Code, http.StatusInternalServerError)
	}

	body := decodeEnvelope(t, recorder)
	if body.Code != 50100 {
		t.Fatalf("GET /api/v1/templates code = %d, want 50100", body.Code)
	}
	if body.Error == nil || body.Error.Type != "not_implemented" {
		t.Fatalf("GET /api/v1/templates error = %#v, want not_implemented", body.Error)
	}
	if body.Error.Details["field"] != "REGION" {
		t.Fatalf("GET /api/v1/templates error.details.field = %#v, want REGION", body.Error.Details["field"])
	}
}

func TestListAgentsRequiresAuthorization(t *testing.T) {
	t.Parallel()

	recorder := performRequest(t, http.MethodGet, "/api/v1/agents", "", "", nil)
	if recorder.Code != http.StatusUnauthorized {
		t.Fatalf("GET /api/v1/agents without Authorization status = %d, want %d", recorder.Code, http.StatusUnauthorized)
	}

	body := decodeEnvelope(t, recorder)
	if body.Code != 40010 {
		t.Fatalf("GET /api/v1/agents without Authorization code = %d, want 40010", body.Code)
	}
	if body.Error == nil || body.Error.Type != "missing_authorization" {
		t.Fatalf("GET /api/v1/agents without Authorization error = %#v, want missing_authorization", body.Error)
	}
	if body.Error.Details["header"] != "Authorization" {
		t.Fatalf("GET /api/v1/agents without Authorization error.details.header = %#v, want Authorization", body.Error.Details["header"])
	}
	if body.Error.Details["reason"] != "required" {
		t.Fatalf("GET /api/v1/agents without Authorization error.details.reason = %#v, want required", body.Error.Details["reason"])
	}
}

func TestListAgentsRejectsInvalidAuthorization(t *testing.T) {
	t.Parallel()

	recorder := performRequest(t, http.MethodGet, "/api/v1/agents", "", "", map[string]string{
		"Authorization": "%",
	})
	if recorder.Code != http.StatusUnauthorized {
		t.Fatalf("GET /api/v1/agents invalid Authorization status = %d, want %d", recorder.Code, http.StatusUnauthorized)
	}

	body := decodeEnvelope(t, recorder)
	if body.Code != 40011 {
		t.Fatalf("GET /api/v1/agents invalid Authorization code = %d, want 40011", body.Code)
	}
	if body.Error == nil || body.Error.Type != "invalid_authorization" {
		t.Fatalf("GET /api/v1/agents invalid Authorization error = %#v, want invalid_authorization", body.Error)
	}
	if body.Error.Details["reason"] != "invalid_url_encoding" {
		t.Fatalf("GET /api/v1/agents invalid Authorization error.details.reason = %#v, want invalid_url_encoding", body.Error.Details["reason"])
	}
}

func TestEnsureAIProxyTokenRequiresAuthorization(t *testing.T) {
	t.Parallel()

	recorder := performRequest(t, http.MethodPost, "/api/v1/aiproxy/token/ensure", "", "", nil)
	if recorder.Code != http.StatusUnauthorized {
		t.Fatalf("POST /api/v1/aiproxy/token/ensure without Authorization status = %d, want %d", recorder.Code, http.StatusUnauthorized)
	}

	body := decodeEnvelope(t, recorder)
	if body.Code != 40010 {
		t.Fatalf("POST /api/v1/aiproxy/token/ensure without Authorization code = %d, want 40010", body.Code)
	}
	if body.Error == nil || body.Error.Type != "missing_authorization" {
		t.Fatalf("POST /api/v1/aiproxy/token/ensure without Authorization error = %#v, want missing_authorization", body.Error)
	}
}

func TestEnsureAIProxyTokenReturnsExistingToken(t *testing.T) {
	t.Parallel()

	var searchCalls []string
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v2alpha/tokens" {
			t.Fatalf("search path = %q, want /api/v2alpha/tokens", r.URL.Path)
		}
		if auth := r.Header.Get("Authorization"); auth != validEncodedKubeconfig() {
			t.Fatalf("search Authorization = %q, want encoded kubeconfig", auth)
		}

		name := r.URL.Query().Get("name")
		searchCalls = append(searchCalls, name)

		w.Header().Set("Content-Type", "application/json")
		switch name {
		case "agent-hub":
			_, _ = w.Write([]byte(`{"code":0,"message":"ok","data":{"items":[{"id":585,"name":"agent-hub","key":"sk-existing","status":1}]}}`))
		case "agent-hub-ns-test":
			_, _ = w.Write([]byte(`{"code":0,"message":"ok","data":{"items":[]}}`))
		case "agenthub-ns-test":
			_, _ = w.Write([]byte(`{"code":0,"message":"ok","data":{"items":[{"id":585,"name":"agenthub-ns-test","key":"sk-existing","status":1}]}}`))
		default:
			t.Fatalf("unexpected search name = %q", name)
		}
	}))
	defer upstream.Close()

	recorder := performRequestWithConfig(t, config.Config{
		Port:           "8080",
		IngressSuffix:  "agent.usw-1.sealos.app",
		APIServerImage: "nousresearch/hermes-agent:latest",
		AIProxyBaseURL: upstream.URL,
	}, http.MethodPost, "/api/v1/aiproxy/token/ensure", "", "", map[string]string{
		"Authorization": validEncodedKubeconfig(),
	})

	if recorder.Code != http.StatusOK {
		t.Fatalf("POST /api/v1/aiproxy/token/ensure existing status = %d, want %d", recorder.Code, http.StatusOK)
	}

	body := decodeEnvelope(t, recorder)
	data, ok := body.Data["token"].(map[string]any)
	if !ok {
		t.Fatalf("POST /api/v1/aiproxy/token/ensure existing token = %#v, want token map", body.Data["token"])
	}
	if existed, _ := body.Data["existed"].(bool); !existed {
		t.Fatalf("POST /api/v1/aiproxy/token/ensure existing existed = %#v, want true", body.Data["existed"])
	}
	if data["name"] != "agent-hub" {
		t.Fatalf("POST /api/v1/aiproxy/token/ensure existing token.name = %#v, want agent-hub", data["name"])
	}
	if data["key"] != "sk-existing" {
		t.Fatalf("POST /api/v1/aiproxy/token/ensure existing token.key = %#v, want sk-existing", data["key"])
	}
	if strings.Join(searchCalls, ",") != "agent-hub" {
		t.Fatalf("search calls = %q, want fixed-name hit first", strings.Join(searchCalls, ","))
	}
}

func TestEnsureAIProxyTokenCreatesMissingToken(t *testing.T) {
	t.Parallel()

	var createCalls int
	var searchCalls []string
	created := false
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodGet && r.URL.Path == "/api/v2alpha/tokens":
			name := r.URL.Query().Get("name")
			searchCalls = append(searchCalls, name)
			w.Header().Set("Content-Type", "application/json")
			if name == "agent-hub" && created {
				_, _ = w.Write([]byte(`{"code":0,"message":"ok","data":{"items":[{"id":586,"name":"agent-hub","key":"sk-created","status":1}]}}`))
				return
			}
			_, _ = w.Write([]byte(`{"code":0,"message":"ok","data":{"items":[]}}`))
		case r.Method == http.MethodPost && r.URL.Path == "/api/v2alpha/tokens":
			createCalls += 1
			if auth := r.Header.Get("Authorization"); auth != validEncodedKubeconfig() {
				t.Fatalf("create Authorization = %q, want encoded kubeconfig", auth)
			}

			var payload map[string]any
			if err := json.Unmarshal([]byte(readBody(t, r)), &payload); err != nil {
				t.Fatalf("decode create payload: %v", err)
			}
			if payload["name"] != "agent-hub" {
				t.Fatalf("create payload name = %#v, want agent-hub", payload["name"])
			}

			created = true
			w.WriteHeader(http.StatusNoContent)
		default:
			t.Fatalf("unexpected upstream request: %s %s", r.Method, r.URL.Path)
		}
	}))
	defer upstream.Close()

	recorder := performRequestWithConfig(t, config.Config{
		Port:           "8080",
		IngressSuffix:  "agent.usw-1.sealos.app",
		APIServerImage: "nousresearch/hermes-agent:latest",
		AIProxyBaseURL: upstream.URL,
	}, http.MethodPost, "/api/v1/aiproxy/token/ensure", "", "", map[string]string{
		"Authorization": validEncodedKubeconfig(),
	})

	if recorder.Code != http.StatusOK {
		t.Fatalf("POST /api/v1/aiproxy/token/ensure create status = %d, want %d", recorder.Code, http.StatusOK)
	}
	if createCalls != 1 {
		t.Fatalf("create calls = %d, want 1", createCalls)
	}

	body := decodeEnvelope(t, recorder)
	data, ok := body.Data["token"].(map[string]any)
	if !ok {
		t.Fatalf("POST /api/v1/aiproxy/token/ensure create token = %#v, want token map", body.Data["token"])
	}
	if existed, _ := body.Data["existed"].(bool); existed {
		t.Fatalf("POST /api/v1/aiproxy/token/ensure create existed = %#v, want false", body.Data["existed"])
	}
	if data["key"] != "sk-created" {
		t.Fatalf("POST /api/v1/aiproxy/token/ensure create token.key = %#v, want sk-created", data["key"])
	}
	if data["name"] != "agent-hub" {
		t.Fatalf("POST /api/v1/aiproxy/token/ensure create token.name = %#v, want agent-hub", data["name"])
	}
	if strings.Join(searchCalls, ",") != "agent-hub,agent-hub-ns-test,agenthub-ns-test,agent-hub" {
		t.Fatalf("search calls = %q, want fixed legacy legacy fixed", strings.Join(searchCalls, ","))
	}
}

func TestEnsureAIProxyTokenFallsBackToLegacyNamespaceToken(t *testing.T) {
	t.Parallel()

	var searchCalls []string
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet || r.URL.Path != "/api/v2alpha/tokens" {
			t.Fatalf("unexpected upstream request: %s %s", r.Method, r.URL.Path)
		}

		name := r.URL.Query().Get("name")
		searchCalls = append(searchCalls, name)

		w.Header().Set("Content-Type", "application/json")
		switch name {
		case "agent-hub":
			_, _ = w.Write([]byte(`{"code":0,"message":"ok","data":{"items":[]}}`))
		case "agent-hub-ns-test":
			_, _ = w.Write([]byte(`{"code":0,"message":"ok","data":{"items":[]}}`))
		case "agenthub-ns-test":
			_, _ = w.Write([]byte(`{"code":0,"message":"ok","data":{"items":[{"id":587,"name":"agenthub-ns-test","key":"sk-legacy","status":1}]}}`))
		default:
			t.Fatalf("unexpected search name = %q", name)
		}
	}))
	defer upstream.Close()

	recorder := performRequestWithConfig(t, config.Config{
		Port:           "8080",
		IngressSuffix:  "agent.usw-1.sealos.app",
		APIServerImage: "nousresearch/hermes-agent:latest",
		AIProxyBaseURL: upstream.URL,
	}, http.MethodPost, "/api/v1/aiproxy/token/ensure", "", "", map[string]string{
		"Authorization": validEncodedKubeconfig(),
	})

	if recorder.Code != http.StatusOK {
		t.Fatalf("POST /api/v1/aiproxy/token/ensure legacy status = %d, want %d", recorder.Code, http.StatusOK)
	}

	body := decodeEnvelope(t, recorder)
	data, ok := body.Data["token"].(map[string]any)
	if !ok {
		t.Fatalf("POST /api/v1/aiproxy/token/ensure legacy token = %#v, want token map", body.Data["token"])
	}
	if existed, _ := body.Data["existed"].(bool); !existed {
		t.Fatalf("POST /api/v1/aiproxy/token/ensure legacy existed = %#v, want true", body.Data["existed"])
	}
	if data["name"] != "agenthub-ns-test" {
		t.Fatalf("POST /api/v1/aiproxy/token/ensure legacy token.name = %#v, want agenthub-ns-test", data["name"])
	}
	if data["key"] != "sk-legacy" {
		t.Fatalf("POST /api/v1/aiproxy/token/ensure legacy token.key = %#v, want sk-legacy", data["key"])
	}
	if strings.Join(searchCalls, ",") != "agent-hub,agent-hub-ns-test,agenthub-ns-test" {
		t.Fatalf("search calls = %q, want fixed then legacy names", strings.Join(searchCalls, ","))
	}
}

func TestCreateAgentRejectsInvalidJSONBeforeKubernetesCalls(t *testing.T) {
	t.Parallel()

	recorder := performRequest(t, http.MethodPost, "/api/v1/agents", "{", "", map[string]string{
		"Authorization": validEncodedKubeconfig(),
		"Content-Type":  "application/json",
	})
	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("POST /api/v1/agents invalid JSON status = %d, want %d", recorder.Code, http.StatusBadRequest)
	}

	body := decodeEnvelope(t, recorder)
	if body.Code != 40000 {
		t.Fatalf("POST /api/v1/agents invalid JSON code = %d, want 40000", body.Code)
	}
	if body.Error == nil || body.Error.Type != "invalid_json" {
		t.Fatalf("POST /api/v1/agents invalid JSON error = %#v, want invalid_json", body.Error)
	}
}

func TestCreateAgentValidationErrorsUse422Envelope(t *testing.T) {
	t.Parallel()

	payload := `{
		"template-id":"hermes-agent",
		"agent-name":"demo-agent",
		"agent-cpu":"1000m",
		"agent-memory":"2Gi",
		"agent-storage":"10Gi",
		"settings":{
			"provider":"openai",
			"baseURL":"not-a-url",
			"model":"gpt-4.1"
		}
	}`

	recorder := performRequest(t, http.MethodPost, "/api/v1/agents", payload, "", map[string]string{
		"Authorization": validEncodedKubeconfig(),
		"Content-Type":  "application/json",
	})
	if recorder.Code != http.StatusUnprocessableEntity {
		t.Fatalf("POST /api/v1/agents invalid payload status = %d, want %d", recorder.Code, http.StatusUnprocessableEntity)
	}

	body := decodeEnvelope(t, recorder)
	if body.Code != 42200 {
		t.Fatalf("POST /api/v1/agents invalid payload code = %d, want 42200", body.Code)
	}
	if body.Error == nil || body.Error.Type != "validation_failed" {
		t.Fatalf("POST /api/v1/agents invalid payload error = %#v, want validation_failed", body.Error)
	}
	if body.Error.Details["field"] != "settings.provider" &&
		body.Error.Details["field"] != "settings.baseURL" &&
		body.Error.Details["field"] != "settings.model" {
		t.Fatalf("POST /api/v1/agents invalid payload error.details.field = %#v, want settings.provider/settings.baseURL/settings.model", body.Error.Details["field"])
	}
	if body.Error.Details["reason"] != "unsupported_field" && body.Error.Details["reason"] != "invalid_url" {
		t.Fatalf("POST /api/v1/agents invalid payload error.details.reason = %#v, want unsupported_field/invalid_url", body.Error.Details["reason"])
	}
}

func TestUpdateAgentOnlyAcceptsPatchRoute(t *testing.T) {
	t.Parallel()

	postRecorder := performRequest(t, http.MethodPost, "/api/v1/agents/demo-agent", "", "", nil)
	if postRecorder.Code != http.StatusNotFound {
		t.Fatalf("POST /api/v1/agents/:agentName status = %d, want %d", postRecorder.Code, http.StatusNotFound)
	}

	patchRecorder := performRequest(t, http.MethodPatch, "/api/v1/agents/demo-agent", "", "", nil)
	if patchRecorder.Code != http.StatusNotFound {
		t.Fatalf("PATCH /api/v1/agents/:agentName status = %d, want %d", patchRecorder.Code, http.StatusNotFound)
	}

	runtimeRecorder := performRequest(t, http.MethodPatch, "/api/v1/agents/demo-agent/runtime", "", "", nil)
	if runtimeRecorder.Code != http.StatusUnauthorized {
		t.Fatalf("PATCH /api/v1/agents/:agentName/runtime status = %d, want %d", runtimeRecorder.Code, http.StatusUnauthorized)
	}

	settingsRecorder := performRequest(t, http.MethodPatch, "/api/v1/agents/demo-agent/settings", "", "", nil)
	if settingsRecorder.Code != http.StatusUnauthorized {
		t.Fatalf("PATCH /api/v1/agents/:agentName/settings status = %d, want %d", settingsRecorder.Code, http.StatusUnauthorized)
	}
}

func TestPauseRouteReplacesStopRoute(t *testing.T) {
	t.Parallel()

	stopRecorder := performRequest(t, http.MethodPost, "/api/v1/agents/demo-agent/stop", "", "", nil)
	if stopRecorder.Code != http.StatusNotFound {
		t.Fatalf("POST /api/v1/agents/:agentName/stop status = %d, want %d", stopRecorder.Code, http.StatusNotFound)
	}

	pauseRecorder := performRequest(t, http.MethodPost, "/api/v1/agents/demo-agent/pause", "", "", nil)
	if pauseRecorder.Code != http.StatusUnauthorized {
		t.Fatalf("POST /api/v1/agents/:agentName/pause status = %d, want %d", pauseRecorder.Code, http.StatusUnauthorized)
	}
}

func TestAgentConsoleRequiresAuthorization(t *testing.T) {
	t.Parallel()

	recorder := performRequest(t, http.MethodGet, "/api/v1/agents/demo-agent/console", "", "", nil)
	if recorder.Code != http.StatusUnauthorized {
		t.Fatalf("GET /api/v1/agents/:agentName/console status = %d, want %d", recorder.Code, http.StatusUnauthorized)
	}

	body := decodeEnvelope(t, recorder)
	if body.Code != 40010 {
		t.Fatalf("GET /api/v1/agents/:agentName/console code = %d, want 40010", body.Code)
	}
	if body.Error == nil || body.Error.Type != "missing_authorization" {
		t.Fatalf("GET /api/v1/agents/:agentName/console error = %#v, want missing_authorization", body.Error)
	}
}

func TestInvalidRequestIDHeaderIsRegenerated(t *testing.T) {
	t.Parallel()

	recorder := performRequest(t, http.MethodGet, "/healthz", "", "", map[string]string{
		"X-Request-Id": "bad id with spaces",
	})

	body := decodeEnvelope(t, recorder)
	if body.RequestID == "bad id with spaces" {
		t.Fatal("invalid X-Request-Id should be replaced")
	}
	if header := recorder.Header().Get("X-Request-Id"); header != body.RequestID {
		t.Fatalf("response X-Request-Id = %q, want %q", header, body.RequestID)
	}
}

func TestAgentKeyReadbackEndpointIsDisabled(t *testing.T) {
	t.Parallel()

	recorder := performRequest(t, http.MethodGet, "/api/v1/agents/demo-agent/key", "", "", nil)
	if recorder.Code != http.StatusNotImplemented {
		t.Fatalf("GET /api/v1/agents/:agentName/key status = %d, want %d", recorder.Code, http.StatusNotImplemented)
	}

	body := decodeEnvelope(t, recorder)
	if body.Code != 50100 {
		t.Fatalf("GET /api/v1/agents/:agentName/key code = %d, want 50100", body.Code)
	}
	if body.Error == nil || body.Error.Type != "not_implemented" {
		t.Fatalf("GET /api/v1/agents/:agentName/key error = %#v, want not_implemented", body.Error)
	}
	if body.Error.Details["reason"] != "sensitive_key_readback_disabled" {
		t.Fatalf("GET /api/v1/agents/:agentName/key error.details.reason = %#v, want sensitive_key_readback_disabled", body.Error.Details["reason"])
	}
}

func TestWebSocketEndpointRequiresWebSocketUpgrade(t *testing.T) {
	t.Parallel()

	recorder := performRequest(t, http.MethodGet, "/api/v1/agents/demo-agent/ws", "", "", nil)
	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("GET /api/v1/agents/:agentName/ws status = %d, want %d", recorder.Code, http.StatusBadRequest)
	}
}

func performRequest(t *testing.T, method, target, body, rawQuery string, headers map[string]string) *httptest.ResponseRecorder {
	t.Helper()

	return performRequestWithConfig(t, config.Config{
		Port:                "8080",
		IngressSuffix:       "agent.usw-1.sealos.app",
		APIServerImage:      "nousresearch/hermes-agent:latest",
		AIProxyModelBaseURL: "https://aiproxy.example.com/v1",
		Region:              "us",
	}, method, target, body, rawQuery, headers)
}

func performRequestWithConfig(t *testing.T, cfg config.Config, method, target, body, rawQuery string, headers map[string]string) *httptest.ResponseRecorder {
	t.Helper()

	engine := New(cfg)

	if rawQuery != "" {
		target += "?" + rawQuery
	}
	req := httptest.NewRequest(method, target, strings.NewReader(body))
	for key, value := range headers {
		req.Header.Set(key, value)
	}

	recorder := httptest.NewRecorder()
	engine.ServeHTTP(recorder, req)
	return recorder
}

func readBody(t *testing.T, r *http.Request) string {
	t.Helper()

	raw, err := io.ReadAll(r.Body)
	if err != nil {
		t.Fatalf("read request body: %v", err)
	}
	return string(raw)
}

func decodeEnvelope(t *testing.T, recorder *httptest.ResponseRecorder) testEnvelope {
	t.Helper()

	var envelope testEnvelope
	if err := jsonNewDecoder(recorder.Body.String(), &envelope); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	return envelope
}

func validEncodedKubeconfig() string {
	raw := strings.TrimSpace(`
apiVersion: v1
kind: Config
current-context: test
clusters:
  - name: local
    cluster:
      server: https://127.0.0.1
contexts:
  - name: test
    context:
      cluster: local
      user: test-user
      namespace: ns-test
users:
  - name: test-user
    user:
      token: test-token
`)
	return url.QueryEscape(raw)
}

func jsonNewDecoder(raw string, target any) error {
	return json.Unmarshal([]byte(raw), target)
}
