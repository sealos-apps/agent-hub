package response

import (
	"bytes"
	"encoding/json"
	"net/http"

	"github.com/gin-gonic/gin"
)

type Envelope struct {
	Code      int        `json:"code"`
	Message   string     `json:"message"`
	RequestID string     `json:"requestId,omitempty"`
	Error     *ErrorBody `json:"error,omitempty"`
	Data      any        `json:"data"`
}

type ErrorBody struct {
	Type    string         `json:"type"`
	Details map[string]any `json:"details,omitempty"`
}

type ErrorCoder interface {
	error
	Code() int
	Type() string
	Details() map[string]any
}

func Success(requestID string, data any) Envelope {
	return Envelope{
		Code:      0,
		Message:   "ok",
		RequestID: requestID,
		Data:      data,
	}
}

func WriteJSON(w http.ResponseWriter, status int, payload Envelope) {
	var body bytes.Buffer
	if err := json.NewEncoder(&body).Encode(payload); err != nil {
		fallback := Envelope{
			Code:    http.StatusInternalServerError,
			Message: "internal server error",
			Data:    nil,
		}
		body.Reset()
		_ = json.NewEncoder(&body).Encode(fallback)
		status = http.StatusInternalServerError
	}

	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_, _ = w.Write(body.Bytes())
}

func WriteGinJSON(c *gin.Context, status int, payload Envelope) {
	c.JSON(status, payload)
}

func WriteError(w http.ResponseWriter, status int, err ErrorCoder, requestID string) {
	WriteJSON(w, status, Envelope{
		Code:      err.Code(),
		Message:   err.Error(),
		RequestID: requestID,
		Error: &ErrorBody{
			Type:    err.Type(),
			Details: err.Details(),
		},
		Data: nil,
	})
}

func WriteGinError(c *gin.Context, status int, err ErrorCoder, requestID string) {
	WriteGinJSON(c, status, Envelope{
		Code:      err.Code(),
		Message:   err.Error(),
		RequestID: requestID,
		Error: &ErrorBody{
			Type:    err.Type(),
			Details: err.Details(),
		},
		Data: nil,
	})
}
