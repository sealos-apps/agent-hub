package kube

import (
	"net/url"
	"strings"
	"testing"

	appErr "github.com/nightwhite/Agent-Hub/pkg/errors"
)

func TestPreferredAPIServerHostUsesInClusterAddress(t *testing.T) {
	t.Setenv("KUBERNETES_SERVICE_HOST", "10.96.0.1")
	t.Setenv("KUBERNETES_SERVICE_PORT", "443")

	got := preferredAPIServerHost("https://usw-1.sealos.io:6443")

	if got != "https://10.96.0.1:443" {
		t.Fatalf("preferredAPIServerHost() = %q, want in-cluster API server", got)
	}
}

func TestPreferredAPIServerHostKeepsFallbackOutsideCluster(t *testing.T) {
	t.Setenv("KUBERNETES_SERVICE_HOST", "")
	t.Setenv("KUBERNETES_SERVICE_PORT", "")

	got := preferredAPIServerHost("https://usw-1.sealos.io:6443")

	if got != "https://usw-1.sealos.io:6443" {
		t.Fatalf("preferredAPIServerHost() = %q, want fallback", got)
	}
}

func TestFactoryPreservesOriginalClusterServer(t *testing.T) {
	t.Setenv("KUBERNETES_SERVICE_HOST", "10.96.0.1")
	t.Setenv("KUBERNETES_SERVICE_PORT", "443")

	factory, appErr := NewFactoryFromEncodedKubeconfig(testEncodedKubeconfig())
	if appErr != nil {
		t.Fatalf("NewFactoryFromEncodedKubeconfig() error = %v", appErr)
	}

	if got := factory.RESTConfig().Host; got != "https://10.96.0.1:443" {
		t.Fatalf("RESTConfig().Host = %q, want in-cluster API server", got)
	}
	if got := factory.ClusterServer(); got != "https://usw-1.sealos.io:6443" {
		t.Fatalf("ClusterServer() = %q, want original kubeconfig server", got)
	}
}

func TestFactoryRejectsExecCredentialPlugin(t *testing.T) {
	raw := testRawKubeconfig(
		[]string{"      server: https://usw-1.sealos.io:6443"},
		[]string{
			"      exec:",
			"        apiVersion: client.authentication.k8s.io/v1",
			"        command: sh",
			"        args:",
			"          - -c",
			"          - echo pwned",
			"        interactiveMode: Never",
		},
	)

	_, got := NewFactoryFromEncodedKubeconfig(url.QueryEscape(raw))

	if got == nil {
		t.Fatal("NewFactoryFromEncodedKubeconfig() error = nil, want invalid authorization")
	}
	if got.Code() != appErr.CodeInvalidAuthorizationHeader {
		t.Fatalf("NewFactoryFromEncodedKubeconfig() code = %d, want %d", got.Code(), appErr.CodeInvalidAuthorizationHeader)
	}
	if !strings.Contains(got.Error(), "exec credential plugins are not allowed") {
		t.Fatalf("NewFactoryFromEncodedKubeconfig() error = %q, want exec plugin rejection", got.Error())
	}
}

func TestFactoryRejectsClientCertificateData(t *testing.T) {
	raw := testRawKubeconfig(
		[]string{"      server: https://usw-1.sealos.io:6443"},
		[]string{
			"      token: test-token",
			"      client-certificate-data: ZHVtbXk=",
			"      client-key-data: ZHVtbXk=",
		},
	)

	_, got := NewFactoryFromEncodedKubeconfig(url.QueryEscape(raw))

	if got == nil {
		t.Fatal("NewFactoryFromEncodedKubeconfig() error = nil, want invalid authorization")
	}
	if !strings.Contains(got.Error(), "client certificate data is not allowed") {
		t.Fatalf("NewFactoryFromEncodedKubeconfig() error = %q, want client certificate data rejection", got.Error())
	}
}

func TestFactoryRejectsTLSServerNameOverride(t *testing.T) {
	raw := testRawKubeconfig(
		[]string{
			"      server: https://usw-1.sealos.io:6443",
			"      tls-server-name: evil.example.com",
		},
		[]string{"      token: test-token"},
	)

	_, got := NewFactoryFromEncodedKubeconfig(url.QueryEscape(raw))

	if got == nil {
		t.Fatal("NewFactoryFromEncodedKubeconfig() error = nil, want invalid authorization")
	}
	if !strings.Contains(got.Error(), "tls-server-name is not allowed") {
		t.Fatalf("NewFactoryFromEncodedKubeconfig() error = %q, want tls-server-name rejection", got.Error())
	}
}

func TestProxyAuthAllowsEmptyNamespace(t *testing.T) {
	raw := testRawKubeconfigWithoutNamespace(
		[]string{"      server: https://usw-1.sealos.io:6443"},
		[]string{"      token: test-token"},
	)

	auth, err := ParseProxyAuthFromEncodedKubeconfig(url.QueryEscape(raw))

	if err != nil {
		t.Fatalf("ParseProxyAuthFromEncodedKubeconfig() error = %v, want nil", err)
	}
	if auth.Server != "https://usw-1.sealos.io:6443" || auth.Token != "test-token" {
		t.Fatalf("ParseProxyAuthFromEncodedKubeconfig() = %#v, want server/token", auth)
	}
}

func TestFactoryRejectsEmptyNamespace(t *testing.T) {
	raw := testRawKubeconfigWithoutNamespace(
		[]string{"      server: https://usw-1.sealos.io:6443"},
		[]string{"      token: test-token"},
	)

	_, got := NewFactoryFromEncodedKubeconfig(url.QueryEscape(raw))

	if got == nil {
		t.Fatal("NewFactoryFromEncodedKubeconfig() error = nil, want invalid authorization")
	}
	if !strings.Contains(got.Error(), "empty namespace") {
		t.Fatalf("NewFactoryFromEncodedKubeconfig() error = %q, want empty namespace rejection", got.Error())
	}
}

func testRawKubeconfig(clusterLines, userLines []string) string {
	return testRawKubeconfigWithNamespace(clusterLines, userLines, "ns-test")
}

func testRawKubeconfigWithoutNamespace(clusterLines, userLines []string) string {
	return testRawKubeconfigWithNamespace(clusterLines, userLines, "")
}

func testRawKubeconfigWithNamespace(clusterLines, userLines []string, namespace string) string {
	lines := []string{
		"apiVersion: v1",
		"kind: Config",
		"current-context: test",
		"clusters:",
		"  - name: local",
		"    cluster:",
	}
	lines = append(lines, clusterLines...)
	lines = append(lines,
		"contexts:",
		"  - name: test",
		"    context:",
		"      cluster: local",
		"      user: test-user",
	)
	if strings.TrimSpace(namespace) != "" {
		lines = append(lines, "      namespace: "+strings.TrimSpace(namespace))
	}
	lines = append(lines,
		"users:",
		"  - name: test-user",
		"    user:",
	)
	lines = append(lines, userLines...)
	return strings.Join(lines, "\n")
}

func testEncodedKubeconfig() string {
	return "apiVersion%3A%20v1%0Akind%3A%20Config%0Acurrent-context%3A%20test%0Aclusters%3A%0A%20%20-%20name%3A%20local%0A%20%20%20%20cluster%3A%0A%20%20%20%20%20%20server%3A%20https%3A%2F%2Fusw-1.sealos.io%3A6443%0Acontexts%3A%0A%20%20-%20name%3A%20test%0A%20%20%20%20context%3A%0A%20%20%20%20%20%20cluster%3A%20local%0A%20%20%20%20%20%20user%3A%20test-user%0A%20%20%20%20%20%20namespace%3A%20ns-test%0Ausers%3A%0A%20%20-%20name%3A%20test-user%0A%20%20%20%20user%3A%0A%20%20%20%20%20%20token%3A%20test-token%0A"
}
