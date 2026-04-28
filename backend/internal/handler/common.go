package handler

import (
	"context"
	"errors"
	"log"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	apierrors "k8s.io/apimachinery/pkg/api/errors"

	"github.com/nightwhite/Agent-Hub/internal/config"
	k8sclient "github.com/nightwhite/Agent-Hub/internal/kube"
	"github.com/nightwhite/Agent-Hub/internal/middleware"
	appErr "github.com/nightwhite/Agent-Hub/pkg/errors"
	resp "github.com/nightwhite/Agent-Hub/pkg/response"
)

func requestID(c *gin.Context) string {
	value, _ := c.Get(middleware.RequestIDKey)
	if text, ok := value.(string); ok {
		return text
	}
	return ""
}

func runtimeConfig(c *gin.Context) config.Config {
	value, _ := c.Get(middleware.RuntimeConfigKey)
	cfg, _ := value.(config.Config)
	return cfg
}

func kubeFactory(c *gin.Context) (*k8sclient.Factory, *appErr.AppError) {
	factory, err := k8sclient.NewFactoryFromHeaders(c.Request.Header)
	if err != nil {
		return nil, err
	}
	return factory, nil
}

func writeAppError(c *gin.Context, status int, err *appErr.AppError) {
	resp.WriteGinError(c, status, err, requestID(c))
}

func writeSuccess(c *gin.Context, status int, data any) {
	resp.WriteGinJSON(c, status, resp.Success(requestID(c), data))
}

func writeHeaderKubeconfigError(c *gin.Context, err *appErr.AppError) {
	writeAppError(c, http.StatusUnauthorized, err)
}

func writeKubernetesError(c *gin.Context, err error, message string) {
	if isClientCanceledError(err) {
		writeAppError(c, 499, appErr.New(appErr.CodeKubernetesOperation, "request canceled"))
		return
	}
	if isDeadlineExceededError(err) {
		writeAppError(c, http.StatusGatewayTimeout, appErr.New(appErr.CodeKubernetesOperation, "request timeout"))
		return
	}
	if err != nil {
		log.Printf("%s: %v", message, err)
	}
	if apierrors.IsNotFound(err) {
		writeAppError(c, http.StatusNotFound, appErr.New(appErr.CodeNotFound, message))
		return
	}
	if apierrors.IsAlreadyExists(err) {
		writeAppError(c, http.StatusConflict, appErr.New(appErr.CodeConflict, message))
		return
	}
	writeAppError(c, http.StatusInternalServerError, appErr.New(appErr.CodeKubernetesOperation, message))
}

func writeValidationError(c *gin.Context, err *appErr.AppError) {
	writeAppError(c, http.StatusUnprocessableEntity, err)
}

func isCanceledRequestError(err error) bool {
	return isClientCanceledError(err) || isDeadlineExceededError(err)
}

func isClientCanceledError(err error) bool {
	if err == nil {
		return false
	}
	if errors.Is(err, context.Canceled) {
		return true
	}
	message := strings.ToLower(strings.TrimSpace(err.Error()))
	return strings.Contains(message, "context canceled")
}

func isDeadlineExceededError(err error) bool {
	if err == nil {
		return false
	}
	if errors.Is(err, context.DeadlineExceeded) {
		return true
	}
	message := strings.ToLower(strings.TrimSpace(err.Error()))
	return strings.Contains(message, "deadline exceeded")
}
