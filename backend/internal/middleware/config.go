package middleware

import (
	"github.com/gin-gonic/gin"

	"github.com/nightwhite/Agent-Hub/internal/config"
)

const RuntimeConfigKey = "runtimeConfig"

func InjectRuntimeConfig(cfg config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Set(RuntimeConfigKey, cfg)
		c.Next()
	}
}
