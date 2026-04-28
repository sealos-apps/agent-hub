package handler

import (
	"errors"
	"io"
	"log"
	"net/http"
	"regexp"
	"strings"

	"github.com/gin-gonic/gin"

	"github.com/nightwhite/Agent-Hub/internal/aiproxy"
	"github.com/nightwhite/Agent-Hub/internal/dto"
	"github.com/nightwhite/Agent-Hub/internal/kube"
	appErr "github.com/nightwhite/Agent-Hub/pkg/errors"
)

var invalidAIProxyTokenChars = regexp.MustCompile(`[^a-z0-9-]+`)

func EnsureAIProxyToken(c *gin.Context) {
	factory, authErr := kubeFactory(c)
	if authErr != nil {
		writeHeaderKubeconfigError(c, authErr)
		return
	}

	var req dto.EnsureAIProxyTokenRequest
	if c.Request.Body != nil && c.Request.ContentLength != 0 {
		if err := c.ShouldBindJSON(&req); err != nil && !errors.Is(err, io.EOF) {
			writeAppError(c, http.StatusBadRequest, appErr.ErrInvalidJSON)
			return
		}
	}

	tokenName := preferredAIProxyTokenName(factory.Namespace())
	if strings.TrimSpace(req.Name) != "" {
		tokenName = sanitizeAIProxyTokenName(req.Name)
	}
	if tokenName == "" {
		writeAppError(c, http.StatusBadRequest, appErr.New(appErr.CodeInvalidRequest, "invalid aiproxy token name").WithDetails(map[string]any{
			"field":  "name",
			"reason": "empty_after_sanitize",
		}))
		return
	}

	resolvedBaseURL := resolveAIProxyBaseURL(runtimeConfig(c).AIProxyBaseURL, factory.ClusterServer())
	resolvedAuth := strings.TrimSpace(c.GetHeader(kube.DefaultAuthorizationHeader))
	client, clientErr := aiproxy.NewClient(resolvedBaseURL, nil)
	if clientErr != nil {
		writeAppError(c, http.StatusInternalServerError, appErr.New(appErr.CodeAIProxyOperation, "invalid aiproxy base url").WithDetails(map[string]any{
			"reason":     clientErr.Error(),
			"baseURL":    resolvedBaseURL,
			"clusterURL": factory.ClusterServer(),
		}))
		return
	}

	token, existed, resolvedTokenName, ensureErr := ensureAgentHubAIProxyToken(
		c.Request.Context(),
		client,
		resolvedAuth,
		factory.Namespace(),
		req.Name,
	)
	if ensureErr != nil {
		details := map[string]any{
			"name":       resolvedTokenName,
			"baseURL":    resolvedBaseURL,
			"clusterURL": factory.ClusterServer(),
			"reason":     ensureErr.Error(),
		}
		if apiErr, ok := ensureErr.(*aiproxy.APIError); ok {
			details["upstreamStatus"] = apiErr.Status
			details["upstreamMessage"] = apiErr.Message
		}
		log.Printf("aiproxy ensure token failed: name=%s baseURL=%s clusterURL=%s err=%v details=%v", resolvedTokenName, resolvedBaseURL, factory.ClusterServer(), ensureErr, details)
		writeAppError(c, http.StatusBadGateway, appErr.New(appErr.CodeAIProxyOperation, "failed to ensure aiproxy token").WithDetails(details))
		return
	}

	writeSuccess(c, http.StatusOK, dto.EnsureAIProxyTokenResponse{
		Token: dto.AIProxyToken{
			ID:     token.ID,
			Name:   token.Name,
			Key:    token.Key,
			Status: token.Status,
		},
		Existed: existed,
	})
}

func sanitizeAIProxyTokenName(value string) string {
	normalized := strings.ToLower(strings.TrimSpace(value))
	normalized = invalidAIProxyTokenChars.ReplaceAllString(normalized, "-")
	normalized = strings.Trim(normalized, "-")
	if normalized == "" {
		return ""
	}

	const maxLength = 32
	if len(normalized) > maxLength {
		normalized = strings.Trim(normalized[:maxLength], "-")
	}

	if normalized == "" {
		return ""
	}

	return normalized
}
