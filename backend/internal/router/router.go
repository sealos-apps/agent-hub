package router

import (
	"github.com/gin-gonic/gin"

	"github.com/nightwhite/Agent-Hub/internal/config"
	"github.com/nightwhite/Agent-Hub/internal/handler"
	"github.com/nightwhite/Agent-Hub/internal/middleware"
)

func New(cfg config.Config) *gin.Engine {
	gin.SetMode(gin.ReleaseMode)

	engine := gin.New()
	engine.Use(gin.Logger())
	engine.Use(gin.Recovery())
	engine.Use(middleware.RequestID())
	engine.Use(middleware.InjectRuntimeConfig(cfg))

	engine.GET("/healthz", handler.Health)
	engine.GET("/readyz", handler.Ready)

	v1 := engine.Group("/api/v1")
	{
		v1.GET("/system/config", handler.GetSystemConfig)
		v1.GET("/templates", handler.ListTemplates)
		v1.POST("/aiproxy/token/ensure", handler.EnsureAIProxyToken)
		v1.GET("/agents", handler.ListAgents)
		v1.POST("/agents", handler.CreateAgent)
		v1.GET("/agents/:agentName", handler.GetAgent)
		v1.GET("/agents/:agentName/console", handler.GetAgentConsole)
		v1.GET("/agents/:agentName/access/ssh", handler.GetAgentSSHAccess)
		v1.PATCH("/agents/:agentName/runtime", handler.UpdateAgentRuntime)
		v1.PATCH("/agents/:agentName/settings", handler.UpdateAgentSettings)
		v1.DELETE("/agents/:agentName", handler.DeleteAgent)
		v1.POST("/agents/:agentName/run", handler.RunAgent)
		v1.POST("/agents/:agentName/pause", handler.PauseAgent)
		v1.GET("/agents/:agentName/key", handler.GetAgentKey)
		v1.POST("/agents/:agentName/key/rotate", handler.RotateAgentKey)
		v1.POST("/agents/:agentName/chat/completions", handler.ChatCompletions)
		v1.GET("/agents/:agentName/ws", handler.AgentWebSocket)
	}

	engine.Any("/k8s-api/*proxyPath", handler.KubernetesProxy)
	engine.Any("/k8s-api", handler.KubernetesProxy)
	handler.RegisterFrontendRoutes(engine, cfg)

	return engine
}
