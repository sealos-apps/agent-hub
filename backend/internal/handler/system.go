package handler

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	appErr "github.com/nightwhite/Agent-Hub/pkg/errors"
)

func GetSystemConfig(c *gin.Context) {
	cfg := runtimeConfig(c)
	if strings.TrimSpace(cfg.Region) == "" {
		writeAppError(c, http.StatusInternalServerError, appErr.New(appErr.CodeNotImplemented, "REGION is required").WithDetails(map[string]any{
			"field":  "REGION",
			"reason": "missing_or_invalid",
		}))
		return
	}

	writeSuccess(c, http.StatusOK, gin.H{
		"region":              cfg.Region,
		"sshDomain":           cfg.SSHDomain,
		"aiProxyModelBaseURL": cfg.AIProxyModelBaseURL,
	})
}
