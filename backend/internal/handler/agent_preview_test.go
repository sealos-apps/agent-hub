package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
)

type fakePreviewTunnel struct {
	target string
	closed bool
}

func (t *fakePreviewTunnel) LocalURL() string {
	return t.target
}

func (t *fakePreviewTunnel) Close() {
	t.closed = true
}

func TestPreviewPortValidation(t *testing.T) {
	t.Parallel()

	for _, port := range []int{1, 3000, 5173, 65535} {
		if !validPreviewPort(port) {
			t.Fatalf("validPreviewPort(%d) = false, want true", port)
		}
	}

	for _, port := range []int{-1, 0, 65536, 99999} {
		if validPreviewPort(port) {
			t.Fatalf("validPreviewPort(%d) = true, want false", port)
		}
	}
}

func TestPreviewManagerCreatesCleanPreviewURL(t *testing.T) {
	t.Parallel()

	manager := newPreviewManager(previewManagerOptions{
		basePath: "/__preview",
		starter: previewTunnelStarterFunc(func(context.Context, previewTunnelTarget) (previewTunnel, error) {
			return &fakePreviewTunnel{target: "http://127.0.0.1:45678"}, nil
		}),
	})

	session, err := manager.create(context.Background(), previewCreateOptions{
		agentName: "demo-agent",
		namespace: "ns-test",
		podName:   "demo-pod",
		port:      3000,
	})
	if err != nil {
		t.Fatalf("manager.create() error = %v, want nil", err)
	}

	if session.ID == "" {
		t.Fatal("session.ID = empty, want generated id")
	}
	if session.URL != "/__preview/"+session.ID+"/" {
		t.Fatalf("session.URL = %q, want /__preview/<id>/", session.URL)
	}
	if session.Port != 3000 {
		t.Fatalf("session.Port = %d, want 3000", session.Port)
	}
	if session.Secret == "" {
		t.Fatal("session.Secret = empty, want generated access secret")
	}
}

func TestNewPreviewIDRequiresRandomBytes(t *testing.T) {
	t.Parallel()

	if _, err := newPreviewIDFromReader(strings.NewReader("short")); err == nil {
		t.Fatal("newPreviewIDFromReader() error = nil, want error for short entropy")
	}

	id, err := newPreviewIDFromReader(strings.NewReader("abcdefghijklmnop"))
	if err != nil {
		t.Fatalf("newPreviewIDFromReader() error = %v, want nil", err)
	}
	if id != "p_6162636465666768696a6b6c6d6e6f70" {
		t.Fatalf("newPreviewIDFromReader() = %q, want hex encoded id", id)
	}
}

func TestPreviewManagerReleaseClosesTunnel(t *testing.T) {
	t.Parallel()

	tunnel := &fakePreviewTunnel{target: "http://127.0.0.1:45678"}
	manager := newPreviewManager(previewManagerOptions{
		basePath: "/__preview",
		starter: previewTunnelStarterFunc(func(context.Context, previewTunnelTarget) (previewTunnel, error) {
			return tunnel, nil
		}),
	})

	session, err := manager.create(context.Background(), previewCreateOptions{
		agentName: "demo-agent",
		namespace: "ns-test",
		podName:   "demo-pod",
		port:      3000,
	})
	if err != nil {
		t.Fatalf("manager.create() error = %v, want nil", err)
	}

	if !manager.release(session.ID, "demo-agent", "ns-test") {
		t.Fatal("manager.release() = false, want true")
	}
	if !tunnel.closed {
		t.Fatal("preview tunnel was not closed")
	}
	if manager.release(session.ID, "demo-agent", "ns-test") {
		t.Fatal("manager.release() second call = true, want false")
	}
}

func TestPreviewManagerExpireIdleSessionsClosesTunnel(t *testing.T) {
	t.Parallel()

	now := time.Unix(1000, 0)
	tunnel := &fakePreviewTunnel{target: "http://127.0.0.1:45678"}
	manager := newPreviewManager(previewManagerOptions{
		basePath: "/__preview",
		idleTTL:  2 * time.Minute,
		now: func() time.Time {
			return now
		},
		starter: previewTunnelStarterFunc(func(context.Context, previewTunnelTarget) (previewTunnel, error) {
			return tunnel, nil
		}),
	})

	session, err := manager.create(context.Background(), previewCreateOptions{
		agentName: "demo-agent",
		namespace: "ns-test",
		podName:   "demo-pod",
		port:      3000,
	})
	if err != nil {
		t.Fatalf("manager.create() error = %v, want nil", err)
	}

	now = now.Add(2*time.Minute + time.Second)
	expired := manager.expireIdleSessions()
	if expired != 1 {
		t.Fatalf("manager.expireIdleSessions() = %d, want 1", expired)
	}
	if !tunnel.closed {
		t.Fatal("expired preview tunnel was not closed")
	}
	if manager.heartbeat(session.ID, "demo-agent", "ns-test") {
		t.Fatal("heartbeat on expired session = true, want false")
	}
}

func TestPreviewManagerRejectsWrongAgentForHeartbeatAndRelease(t *testing.T) {
	t.Parallel()

	now := time.Unix(1000, 0)
	tunnel := &fakePreviewTunnel{target: "http://127.0.0.1:45678"}
	manager := newPreviewManager(previewManagerOptions{
		basePath: "/__preview",
		now: func() time.Time {
			return now
		},
		starter: previewTunnelStarterFunc(func(context.Context, previewTunnelTarget) (previewTunnel, error) {
			return tunnel, nil
		}),
	})

	session, err := manager.create(context.Background(), previewCreateOptions{
		agentName: "demo-agent",
		namespace: "ns-test",
		podName:   "demo-pod",
		port:      3000,
	})
	if err != nil {
		t.Fatalf("manager.create() error = %v, want nil", err)
	}

	now = now.Add(time.Minute)
	if manager.heartbeat(session.ID, "other-agent", "ns-test") {
		t.Fatal("manager.heartbeat() with wrong agent = true, want false")
	}
	if session.lastHeartbeat.Equal(now) {
		t.Fatal("wrong-agent heartbeat updated session timestamp")
	}
	if manager.release(session.ID, "other-agent", "ns-test") {
		t.Fatal("manager.release() with wrong agent = true, want false")
	}
	if tunnel.closed {
		t.Fatal("wrong-agent release closed the preview tunnel")
	}
	if !manager.release(session.ID, "demo-agent", "ns-test") {
		t.Fatal("manager.release() with matching agent = false, want true")
	}
}

func TestPreviewProxyPreservesPathAndQuery(t *testing.T) {
	t.Parallel()

	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/nested/app" {
			t.Fatalf("upstream path = %q, want /nested/app", r.URL.Path)
		}
		if r.URL.RawQuery != "x=1&y=two" {
			t.Fatalf("upstream query = %q, want x=1&y=two", r.URL.RawQuery)
		}
		w.Header().Set("Content-Type", "text/plain")
		_, _ = w.Write([]byte("preview ok"))
	}))
	defer upstream.Close()

	manager := newPreviewManager(previewManagerOptions{
		basePath: "/__preview",
		starter: previewTunnelStarterFunc(func(context.Context, previewTunnelTarget) (previewTunnel, error) {
			return &fakePreviewTunnel{target: upstream.URL}, nil
		}),
	})
	session, err := manager.create(context.Background(), previewCreateOptions{
		agentName: "demo-agent",
		namespace: "ns-test",
		podName:   "demo-pod",
		port:      3000,
	})
	if err != nil {
		t.Fatalf("manager.create() error = %v, want nil", err)
	}

	request := httptest.NewRequest(http.MethodGet, "/__preview/"+session.ID+"/nested/app?x=1&y=two", nil)
	request.AddCookie(&http.Cookie{Name: session.cookieName(), Value: session.Secret})
	recorder := httptest.NewRecorder()

	manager.proxy(recorder, request, session.ID, "/nested/app")

	if recorder.Code != http.StatusOK {
		t.Fatalf("proxy status = %d, want %d", recorder.Code, http.StatusOK)
	}
	if body := strings.TrimSpace(recorder.Body.String()); body != "preview ok" {
		t.Fatalf("proxy body = %q, want preview ok", body)
	}
}

func TestPreviewProxyRequiresSessionCookie(t *testing.T) {
	t.Parallel()

	upstreamCalled := false
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		upstreamCalled = true
		_, _ = w.Write([]byte("preview ok"))
	}))
	defer upstream.Close()

	manager := newPreviewManager(previewManagerOptions{
		basePath: "/__preview",
		starter: previewTunnelStarterFunc(func(context.Context, previewTunnelTarget) (previewTunnel, error) {
			return &fakePreviewTunnel{target: upstream.URL}, nil
		}),
	})
	session, err := manager.create(context.Background(), previewCreateOptions{
		agentName: "demo-agent",
		namespace: "ns-test",
		podName:   "demo-pod",
		port:      3000,
	})
	if err != nil {
		t.Fatalf("manager.create() error = %v, want nil", err)
	}

	request := httptest.NewRequest(http.MethodGet, "/__preview/"+session.ID+"/", nil)
	recorder := httptest.NewRecorder()

	manager.proxy(recorder, request, session.ID, "/")

	if recorder.Code != http.StatusNotFound {
		t.Fatalf("proxy without cookie status = %d, want %d", recorder.Code, http.StatusNotFound)
	}
	if upstreamCalled {
		t.Fatal("proxy without cookie reached upstream")
	}
}

func TestPreviewProxyRewritesHTMLRootAssetPaths(t *testing.T) {
	t.Parallel()

	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write([]byte(`<html><head><script type="module" src="/@vite/client"></script><link href="/src/style.css" rel="stylesheet"></head><body><form action="/submit"></form><a href="/docs">docs</a></body></html>`))
	}))
	defer upstream.Close()

	manager := newPreviewManager(previewManagerOptions{
		basePath: "/__preview",
		starter: previewTunnelStarterFunc(func(context.Context, previewTunnelTarget) (previewTunnel, error) {
			return &fakePreviewTunnel{target: upstream.URL}, nil
		}),
	})
	session, err := manager.create(context.Background(), previewCreateOptions{
		agentName: "demo-agent",
		namespace: "ns-test",
		podName:   "demo-pod",
		port:      3000,
	})
	if err != nil {
		t.Fatalf("manager.create() error = %v, want nil", err)
	}

	request := httptest.NewRequest(http.MethodGet, "/__preview/"+session.ID+"/", nil)
	request.AddCookie(&http.Cookie{Name: session.cookieName(), Value: session.Secret})
	recorder := httptest.NewRecorder()

	manager.proxy(recorder, request, session.ID, "/")

	body := recorder.Body.String()
	for _, want := range []string{
		`src="/__preview/` + session.ID + `/@vite/client"`,
		`href="/__preview/` + session.ID + `/src/style.css"`,
		`action="/__preview/` + session.ID + `/submit"`,
		`href="/__preview/` + session.ID + `/docs"`,
	} {
		if !strings.Contains(body, want) {
			t.Fatalf("proxy html body = %q, want rewritten %s", body, want)
		}
	}
}

func TestCreateAgentPreviewRejectsInvalidPort(t *testing.T) {
	t.Parallel()

	manager := newPreviewManager(previewManagerOptions{
		basePath: "/__preview",
		starter: previewTunnelStarterFunc(func(context.Context, previewTunnelTarget) (previewTunnel, error) {
			t.Fatal("preview tunnel should not start for invalid port")
			return nil, nil
		}),
	})

	recorder := performPreviewHandlerRequest(
		http.MethodPost,
		"/api/v1/agents/demo-agent/previews",
		`{"port":0}`,
		map[string]string{"Content-Type": "application/json"},
		func(c *gin.Context) {
			createAgentPreview(c, manager)
		},
	)

	if recorder.Code != http.StatusUnprocessableEntity {
		t.Fatalf("createAgentPreview invalid port status = %d, want %d", recorder.Code, http.StatusUnprocessableEntity)
	}
}

func TestCreateAgentPreviewReturnsSessionPayload(t *testing.T) {
	t.Parallel()

	manager := newPreviewManager(previewManagerOptions{
		basePath: "/__preview",
		starter: previewTunnelStarterFunc(func(_ context.Context, target previewTunnelTarget) (previewTunnel, error) {
			if target.Namespace != "ns-test" {
				t.Fatalf("target.Namespace = %q, want ns-test", target.Namespace)
			}
			if target.PodName != "demo-pod" {
				t.Fatalf("target.PodName = %q, want demo-pod", target.PodName)
			}
			if target.Port != 3000 {
				t.Fatalf("target.Port = %d, want 3000", target.Port)
			}
			return &fakePreviewTunnel{target: "http://127.0.0.1:45678"}, nil
		}),
	})

	recorder := performPreviewHandlerRequest(
		http.MethodPost,
		"/api/v1/agents/demo-agent/previews",
		`{"port":3000}`,
		map[string]string{"Content-Type": "application/json"},
		func(c *gin.Context) {
			c.Set("previewNamespace", "ns-test")
			c.Set("previewPodName", "demo-pod")
			createAgentPreview(c, manager)
		},
	)

	if recorder.Code != http.StatusCreated {
		t.Fatalf("createAgentPreview status = %d, want %d", recorder.Code, http.StatusCreated)
	}

	var envelope struct {
		Code int `json:"code"`
		Data struct {
			ID   string `json:"id"`
			Port int    `json:"port"`
			URL  string `json:"url"`
		} `json:"data"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &envelope); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if envelope.Code != 0 {
		t.Fatalf("response code = %d, want 0", envelope.Code)
	}
	if envelope.Data.ID == "" {
		t.Fatal("response data.id = empty, want preview id")
	}
	if envelope.Data.Port != 3000 {
		t.Fatalf("response data.port = %d, want 3000", envelope.Data.Port)
	}
	if envelope.Data.URL != "/__preview/"+envelope.Data.ID+"/" {
		t.Fatalf("response data.url = %q, want /__preview/<id>/", envelope.Data.URL)
	}
	if len(recorder.Result().Cookies()) != 1 {
		t.Fatalf("response cookies len = %d, want 1", len(recorder.Result().Cookies()))
	}
	cookie := recorder.Result().Cookies()[0]
	if cookie.Path != "/__preview/"+envelope.Data.ID {
		t.Fatalf("preview cookie path = %q, want /__preview/%s", cookie.Path, envelope.Data.ID)
	}
	if strings.Contains(recorder.Body.String(), cookie.Value) {
		t.Fatal("preview response body leaked session cookie secret")
	}
}

func TestDeleteAgentPreviewClearsSessionCookie(t *testing.T) {
	t.Parallel()

	manager := newPreviewManager(previewManagerOptions{
		basePath: "/__preview",
		starter: previewTunnelStarterFunc(func(context.Context, previewTunnelTarget) (previewTunnel, error) {
			return &fakePreviewTunnel{target: "http://127.0.0.1:45678"}, nil
		}),
	})
	session, err := manager.create(context.Background(), previewCreateOptions{
		agentName: "demo-agent",
		namespace: "ns-test",
		podName:   "demo-pod",
		port:      3000,
	})
	if err != nil {
		t.Fatalf("manager.create() error = %v, want nil", err)
	}

	recorder := performPreviewHandlerRequest(
		http.MethodDelete,
		"/api/v1/agents/demo-agent/previews/"+url.PathEscape(session.ID),
		"",
		nil,
		func(c *gin.Context) {
			c.Set("previewNamespace", "ns-test")
			deleteAgentPreview(c, manager)
		},
	)

	if recorder.Code != http.StatusNoContent {
		t.Fatalf("deleteAgentPreview status = %d, want %d", recorder.Code, http.StatusNoContent)
	}
	if len(recorder.Result().Cookies()) != 1 {
		t.Fatalf("deleteAgentPreview cookies len = %d, want 1", len(recorder.Result().Cookies()))
	}
	cookie := recorder.Result().Cookies()[0]
	if cookie.MaxAge >= 0 {
		t.Fatalf("deleteAgentPreview cookie MaxAge = %d, want expired cookie", cookie.MaxAge)
	}
}

func performPreviewHandlerRequest(
	method string,
	target string,
	body string,
	headers map[string]string,
	handler gin.HandlerFunc,
) *httptest.ResponseRecorder {
	gin.SetMode(gin.TestMode)
	engine := gin.New()
	engine.Handle(method, "/api/v1/agents/:agentName/previews", handler)
	engine.Handle(method, "/api/v1/agents/:agentName/previews/:id", handler)
	engine.Handle(method, "/api/v1/agents/:agentName/previews/:id/heartbeat", handler)

	req := httptest.NewRequest(method, target, strings.NewReader(body))
	for key, value := range headers {
		req.Header.Set(key, value)
	}
	recorder := httptest.NewRecorder()
	engine.ServeHTTP(recorder, req)
	return recorder
}
