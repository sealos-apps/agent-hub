package handler

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	appErr "github.com/nightwhite/Agent-Hub/pkg/errors"
)

func Health(c *gin.Context) {
	writeSuccess(c, http.StatusOK, gin.H{"status": "ok"})
}

func Ready(c *gin.Context) {
	cfg := runtimeConfig(c)
	checks := map[string]string{
		"port":           readinessCheck(cfg.Port),
		"ingressSuffix":  readinessCheck(cfg.IngressSuffix),
		"apiServerImage": readinessCheck(cfg.APIServerImage),
		"kubernetes":     "request_scoped",
	}

	for _, status := range checks {
		if status != "ok" && status != "request_scoped" {
			writeAppError(c, http.StatusServiceUnavailable, appErr.New(appErr.CodeNotImplemented, "service is not ready").WithDetails(map[string]any{
				"checks": checks,
			}))
			return
		}
	}

	writeSuccess(c, http.StatusOK, gin.H{
		"status": "ready",
		"checks": checks,
	})
}

func readinessCheck(value string) string {
	if strings.TrimSpace(value) == "" {
		return "missing"
	}
	return "ok"
}
