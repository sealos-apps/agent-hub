package handler

import (
	"context"
	"encoding/base64"
	"strings"
	"testing"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	k8sfake "k8s.io/client-go/kubernetes/fake"

	"github.com/nightwhite/Agent-Hub/internal/agent"
	"github.com/nightwhite/Agent-Hub/internal/agenttemplate"
)

func TestBuildSSHAccessResponseReturnsErrorWhenSecretMissing(t *testing.T) {
	t.Parallel()

	_, err := buildSSHAccessResponse(
		context.Background(),
		k8sfake.NewSimpleClientset(),
		"ns-test",
		"demo-agent",
		"ssh.example.com",
		agent.Agent{SSHPort: 2222, User: "hermes", WorkingDir: "/opt/hermes"},
	)
	if err == nil || !strings.Contains(err.Error(), "read ssh secret") {
		t.Fatalf("buildSSHAccessResponse() error = %v, want read ssh secret failure", err)
	}
}

func TestBuildSSHAccessResponseReturnsErrorWhenSecretIncomplete(t *testing.T) {
	t.Parallel()

	clientset := k8sfake.NewSimpleClientset(&corev1.Secret{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "demo-agent",
			Namespace: "ns-test",
		},
		Data: map[string][]byte{
			devboxPublicKeySecretKey: []byte("public"),
		},
	})

	_, err := buildSSHAccessResponse(
		context.Background(),
		clientset,
		"ns-test",
		"demo-agent",
		"ssh.example.com",
		agent.Agent{SSHPort: 2222, User: "hermes", WorkingDir: "/opt/hermes"},
	)
	if err == nil || !strings.Contains(err.Error(), "ssh secret is incomplete") {
		t.Fatalf("buildSSHAccessResponse() error = %v, want incomplete secret failure", err)
	}
}

func TestBuildSSHAccessResponseSuccess(t *testing.T) {
	t.Parallel()

	clientset := k8sfake.NewSimpleClientset(&corev1.Secret{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "demo-agent",
			Namespace: "ns-test",
		},
		Data: map[string][]byte{
			devboxPublicKeySecretKey:  []byte("public"),
			devboxPrivateKeySecretKey: []byte("private"),
			devboxJWTSecretKey:        []byte(base64.StdEncoding.EncodeToString([]byte("jwt-secret"))),
		},
	})

	payload, err := buildSSHAccessResponse(
		context.Background(),
		clientset,
		"ns-test",
		"demo-agent",
		"ssh.example.com",
		agent.Agent{SSHPort: 2222, User: "hermes", WorkingDir: "/opt/hermes"},
	)
	if err != nil {
		t.Fatalf("buildSSHAccessResponse() error = %v, want nil", err)
	}
	if payload.Host != "ssh.example.com" {
		t.Fatalf("payload.Host = %q, want ssh.example.com", payload.Host)
	}
	if payload.Port != 2222 {
		t.Fatalf("payload.Port = %d, want 2222", payload.Port)
	}
	if payload.UserName != "hermes" {
		t.Fatalf("payload.UserName = %q, want hermes", payload.UserName)
	}
	if payload.WorkingDir != "/opt/hermes" {
		t.Fatalf("payload.WorkingDir = %q, want /opt/hermes", payload.WorkingDir)
	}
	if payload.ConfigHost != "ssh.example.com_ns-test_demo-agent" {
		t.Fatalf("payload.ConfigHost = %q, want ssh.example.com_ns-test_demo-agent", payload.ConfigHost)
	}
	if payload.Token == "" {
		t.Fatal("payload.Token = empty, want generated token")
	}
}

func TestTemplateSupportsAccessUsesExplicitSSHCapability(t *testing.T) {
	t.Parallel()

	hermesTemplate, err := agenttemplate.Resolve("hermes-agent", "")
	if err != nil {
		t.Fatalf("resolve hermes template: %v", err)
	}
	if !templateSupportsAccess(hermesTemplate, "ssh") {
		t.Fatal("templateSupportsAccess(hermes, ssh) = false, want true")
	}

	openClawTemplate, err := agenttemplate.Resolve("openclaw", "")
	if err != nil {
		t.Fatalf("resolve openclaw template: %v", err)
	}
	if templateSupportsAccess(openClawTemplate, "ssh") {
		t.Fatal("templateSupportsAccess(openclaw, ssh) = true, want false")
	}
}
