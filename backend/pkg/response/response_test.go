package response

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestSuccessEnvelopeUsesStandardShape(t *testing.T) {
	t.Parallel()

	envelope := Success("req-123", map[string]any{"status": "ok"})
	if envelope.Code != 0 {
		t.Fatalf("Success().Code = %d, want 0", envelope.Code)
	}
	if envelope.Message != "ok" {
		t.Fatalf("Success().Message = %q, want ok", envelope.Message)
	}
	if envelope.Error != nil {
		t.Fatal("Success().Error must be nil")
	}
}

func TestWriteJSONFallsBackTo500OnEncodingFailure(t *testing.T) {
	t.Parallel()

	recorder := httptest.NewRecorder()
	WriteJSON(recorder, http.StatusOK, Envelope{
		Code:    0,
		Message: "ok",
		Data:    map[string]any{"broken": make(chan int)},
	})

	if recorder.Code != http.StatusInternalServerError {
		t.Fatalf("WriteJSON() status = %d, want %d", recorder.Code, http.StatusInternalServerError)
	}
	if !strings.Contains(recorder.Body.String(), "\"message\":\"internal server error\"") {
		t.Fatalf("WriteJSON() body = %q, want fallback internal server error payload", recorder.Body.String())
	}
}
