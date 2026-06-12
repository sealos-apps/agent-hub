package handler

import (
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"

	"github.com/nightwhite/Agent-Hub/internal/config"
	"github.com/nightwhite/Agent-Hub/internal/kube"
	"github.com/nightwhite/Agent-Hub/internal/middleware"
)

func TestIsAllowedK8sProxyTarget(t *testing.T) {
	t.Parallel()

	cases := map[string]struct {
		rawURL     string
		allowHosts []string
		want       bool
	}{
		"allow exact host": {
			rawURL:     "https://usw-1.sealos.io:6443",
			allowHosts: []string{"usw-1.sealos.io"},
			want:       true,
		},
		"allow suffix host": {
			rawURL:     "https://foo.usw-1.sealos.io:6443",
			allowHosts: []string{".sealos.io"},
			want:       true,
		},
		"disallow host outside default region allowlist": {
			rawURL:     "https://evil.sealos.run:6443",
			allowHosts: []string{"usw.sealos.io", "usw-1.sealos.io", "hzh.sealos.run", "bja.sealos.run", "gzg.sealos.run"},
			want:       false,
		},
		"disallow http scheme": {
			rawURL:     "http://usw-1.sealos.io:6443",
			allowHosts: []string{".sealos.io"},
			want:       false,
		},
		"disallow unknown host": {
			rawURL:     "https://evil.local:6443",
			allowHosts: []string{".sealos.io", ".sealos.run"},
			want:       false,
		},
		"disallow suffix lookalike host": {
			rawURL:     "https://evilsealos.io:6443",
			allowHosts: []string{".sealos.io"},
			want:       false,
		},
		"allow root suffix host itself": {
			rawURL:     "https://sealos.run:6443",
			allowHosts: []string{".sealos.run"},
			want:       true,
		},
	}

	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			parsed, err := url.Parse(tc.rawURL)
			if err != nil {
				t.Fatalf("url.Parse(%q) error = %v", tc.rawURL, err)
			}

			if got := isAllowedK8sProxyTarget(parsed, tc.allowHosts); got != tc.want {
				t.Fatalf("isAllowedK8sProxyTarget(%q, %v) = %v, want %v", tc.rawURL, tc.allowHosts, got, tc.want)
			}
		})
	}
}

func TestKubernetesProxyStripsBrowserCookies(t *testing.T) {
	var gotCookie string
	var gotImpersonateUser string
	upstream := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotCookie = r.Header.Get("Cookie")
		gotImpersonateUser = r.Header.Get("Impersonate-User")
		if got := r.Header.Get("Authorization"); got != "Bearer kube-token" {
			t.Fatalf("upstream Authorization = %q, want bearer token from kubeconfig", got)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"kind":"PodList","items":[]}`))
	}))
	defer upstream.Close()

	upstreamURL, err := url.Parse(upstream.URL)
	if err != nil {
		t.Fatalf("parse upstream URL: %v", err)
	}

	kubeconfig := strings.Join([]string{
		"apiVersion: v1",
		"clusters:",
		"  - name: test",
		"    cluster:",
		"      server: " + upstream.URL,
		"contexts:",
		"  - name: test",
		"    context:",
		"      cluster: test",
		"      namespace: ns-test",
		"      user: test",
		"current-context: test",
		"users:",
		"  - name: test",
		"    user:",
		"      token: kube-token",
	}, "\n")

	previousTransport := secureK8sProxyTransport
	secureK8sProxyTransport = upstream.Client().Transport.(*http.Transport)
	defer func() {
		secureK8sProxyTransport = previousTransport
	}()

	gin.SetMode(gin.TestMode)
	engine := gin.New()
	engine.Use(middleware.InjectRuntimeConfig(config.Config{
		K8sProxyAllowHosts: []string{upstreamURL.Hostname()},
	}))
	engine.Any("/k8s-api/*proxyPath", KubernetesProxy)
	server := httptest.NewServer(engine)
	defer server.Close()

	request, err := http.NewRequest(http.MethodGet, server.URL+"/k8s-api/api/v1/pods", nil)
	if err != nil {
		t.Fatalf("build proxy request: %v", err)
	}
	request.Header.Set(kube.DefaultAuthorizationHeader, url.QueryEscape(kubeconfig))
	request.Header.Set("Cookie", "agenthub_session=secret")
	request.Header.Set("Impersonate-User", "system:masters")
	response, err := server.Client().Do(request)
	if err != nil {
		t.Fatalf("proxy request failed: %v", err)
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusOK {
		t.Fatalf("proxy status = %d, want %d", response.StatusCode, http.StatusOK)
	}
	if gotCookie != "" {
		t.Fatalf("upstream Cookie = %q, want empty", gotCookie)
	}
	if gotImpersonateUser != "" {
		t.Fatalf("upstream Impersonate-User = %q, want empty", gotImpersonateUser)
	}
}

func TestKubernetesProxyRejectsExecCredentialToken(t *testing.T) {
	upstream := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Fatalf("unexpected upstream request with Authorization %q", r.Header.Get("Authorization"))
	}))
	defer upstream.Close()

	upstreamURL, err := url.Parse(upstream.URL)
	if err != nil {
		t.Fatalf("parse upstream URL: %v", err)
	}

	kubeconfig := strings.Join([]string{
		"apiVersion: v1",
		"clusters:",
		"  - name: test",
		"    cluster:",
		"      server: " + upstream.URL,
		"contexts:",
		"  - name: test",
		"    context:",
		"      cluster: test",
		"      namespace: ns-test",
		"      user: test",
		"current-context: test",
		"users:",
		"  - name: test",
		"    user:",
		"      exec:",
		"        apiVersion: client.authentication.k8s.io/v1",
		"        command: sh",
		"        args:",
		"          - -c",
		"          - echo pwned",
		"        env:",
		"          - name: EVIL_TOKEN",
		"            value: stolen-token",
		"        interactiveMode: Never",
	}, "\n")

	gin.SetMode(gin.TestMode)
	engine := gin.New()
	engine.Use(middleware.InjectRuntimeConfig(config.Config{
		K8sProxyAllowHosts: []string{upstreamURL.Hostname()},
	}))
	engine.Any("/k8s-api/*proxyPath", KubernetesProxy)
	server := httptest.NewServer(engine)
	defer server.Close()

	request, err := http.NewRequest(http.MethodGet, server.URL+"/k8s-api/api/v1/pods", nil)
	if err != nil {
		t.Fatalf("build proxy request: %v", err)
	}
	request.Header.Set(kube.DefaultAuthorizationHeader, url.QueryEscape(kubeconfig))

	response, err := server.Client().Do(request)
	if err != nil {
		t.Fatalf("proxy request failed: %v", err)
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusUnauthorized {
		t.Fatalf("proxy status = %d, want %d", response.StatusCode, http.StatusUnauthorized)
	}
}
