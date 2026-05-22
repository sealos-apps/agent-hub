package kube

import "testing"

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

func testEncodedKubeconfig() string {
	return "apiVersion%3A%20v1%0Akind%3A%20Config%0Acurrent-context%3A%20test%0Aclusters%3A%0A%20%20-%20name%3A%20local%0A%20%20%20%20cluster%3A%0A%20%20%20%20%20%20server%3A%20https%3A%2F%2Fusw-1.sealos.io%3A6443%0Acontexts%3A%0A%20%20-%20name%3A%20test%0A%20%20%20%20context%3A%0A%20%20%20%20%20%20cluster%3A%20local%0A%20%20%20%20%20%20user%3A%20test-user%0A%20%20%20%20%20%20namespace%3A%20ns-test%0Ausers%3A%0A%20%20-%20name%3A%20test-user%0A%20%20%20%20user%3A%0A%20%20%20%20%20%20token%3A%20test-token%0A"
}
