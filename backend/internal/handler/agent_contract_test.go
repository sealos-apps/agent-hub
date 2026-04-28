package handler

import (
	"encoding/base64"
	"encoding/json"
	"strings"
	"testing"
	"time"
)

func TestGenerateSSHAccessTokenUsesOneHourTTL(t *testing.T) {
	t.Parallel()

	now := time.Unix(1713500000, 0)
	token, err := generateSSHAccessToken("ns-test", "agent-test", []byte("secret"), now)
	if err != nil {
		t.Fatalf("generateSSHAccessToken() error = %v", err)
	}

	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		t.Fatalf("token parts len = %d, want 3", len(parts))
	}

	payloadRaw, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		t.Fatalf("DecodeString(payload) error = %v", err)
	}

	var payload map[string]any
	if err := json.Unmarshal(payloadRaw, &payload); err != nil {
		t.Fatalf("json.Unmarshal(payload) error = %v", err)
	}

	gotIat, ok := payload["iat"].(float64)
	if !ok {
		t.Fatalf("payload iat missing or invalid: %v", payload["iat"])
	}
	gotExp, ok := payload["exp"].(float64)
	if !ok {
		t.Fatalf("payload exp missing or invalid: %v", payload["exp"])
	}

	if int64(gotExp-gotIat) != int64(sshAccessTokenTTL/time.Second) {
		t.Fatalf("token ttl seconds = %d, want %d", int64(gotExp-gotIat), int64(sshAccessTokenTTL/time.Second))
	}
}

