package handler

import (
	"encoding/json"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"runtime"
	"strings"

	"github.com/gin-gonic/gin"

	"github.com/nightwhite/Agent-Hub/internal/config"
)

func RegisterFrontendRoutes(engine *gin.Engine, cfg config.Config) {
	distDir := resolveWebDistDir(cfg.WebDistDir)
	if distDir == "" {
		return
	}

	handler := serveFrontend(distDir)
	engine.NoRoute(handler)
	engine.NoMethod(handler)
}

func serveFrontend(distDir string) gin.HandlerFunc {
	indexPath := filepath.Join(distDir, "index.html")

	return func(c *gin.Context) {
		requestPath := strings.TrimSpace(c.Request.URL.Path)
		if requestPath == "" {
			requestPath = "/"
		}

		if isReservedFrontendPath(requestPath) {
			c.Status(http.StatusNotFound)
			return
		}

		cleanPath := path.Clean("/" + strings.TrimPrefix(requestPath, "/"))
		if cleanPath == "/" {
			c.File(indexPath)
			return
		}

		targetPath := filepath.Join(distDir, filepath.FromSlash(strings.TrimPrefix(cleanPath, "/")))
		if info, err := os.Stat(targetPath); err == nil && !info.IsDir() {
			c.File(targetPath)
			return
		}

		if path.Ext(cleanPath) != "" {
			c.Status(http.StatusNotFound)
			return
		}

		c.File(indexPath)
	}
}

func isReservedFrontendPath(requestPath string) bool {
	switch {
	case requestPath == "/healthz", requestPath == "/readyz":
		return true
	case strings.HasPrefix(requestPath, "/api/"):
		return true
	case strings.HasPrefix(requestPath, "/k8s-api"):
		return true
	case strings.HasPrefix(requestPath, "/backend-api"):
		return true
	default:
		return false
	}
}

func resolveWebDistDir(override string) string {
	candidates := []string{}
	if trimmed := strings.TrimSpace(override); trimmed != "" {
		candidates = append(candidates, trimmed)
	}

	if cwd, err := os.Getwd(); err == nil {
		candidates = append(candidates,
			filepath.Join(cwd, "web", "dist"),
			filepath.Join(cwd, "..", "web", "dist"),
			filepath.Join(cwd, "..", "..", "web", "dist"),
		)
	}

	if _, file, _, ok := runtime.Caller(0); ok {
		base := filepath.Dir(file)
		candidates = append(candidates, filepath.Join(base, "..", "..", "..", "web", "dist"))
	}

	for _, candidate := range candidates {
		cleaned := filepath.Clean(candidate)
		if info, err := os.Stat(filepath.Join(cleaned, "index.html")); err == nil && !info.IsDir() {
			return cleaned
		}
	}

	return ""
}

func mustJSON(value any) string {
	encoded, err := json.Marshal(value)
	if err != nil {
		return `{"kind":"Status","apiVersion":"v1","metadata":{},"status":"Failure","message":"failed to encode response","reason":"InternalError","code":500}`
	}
	return string(encoded)
}
