package handler

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"github.com/nightwhite/Agent-Hub/internal/config"
)

const healthzServiceName = "agent-hub"

func Health(c *gin.Context) {
	writeHealthz(c)
}

func Ready(c *gin.Context) {
	writeHealthz(c)
}

func writeHealthz(c *gin.Context) {
	if checks, ok := healthChecks(runtimeConfig(c)); !ok {
		c.Header("Cache-Control", "no-store")
		c.JSON(http.StatusServiceUnavailable, gin.H{
			"checks":  checks,
			"service": healthzServiceName,
			"status":  "not_ready",
		})
		return
	}

	c.Header("Cache-Control", "no-store")
	c.JSON(http.StatusOK, gin.H{
		"service": healthzServiceName,
		"status":  "ok",
	})
}

func healthChecks(cfg config.Config) (map[string]string, bool) {
	checks := map[string]string{
		"port":           healthCheck(cfg.Port),
		"ingressSuffix":  healthCheck(cfg.IngressSuffix),
		"apiServerImage": healthCheck(cfg.APIServerImage),
		"kubernetes":     "request_scoped",
	}

	ready := true
	for _, status := range checks {
		if status != "ok" && status != "request_scoped" {
			ready = false
			break
		}
	}
	return checks, ready
}

func healthCheck(value string) string {
	if strings.TrimSpace(value) == "" {
		return "missing"
	}
	return "ok"
}
