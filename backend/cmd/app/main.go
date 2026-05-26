package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os/signal"
	"syscall"
	"time"

	"github.com/nightwhite/Agent-Hub/internal/config"
	"github.com/nightwhite/Agent-Hub/internal/handler"
	"github.com/nightwhite/Agent-Hub/internal/router"
)

func main() {
	cfg := config.Load()
	engine := router.New(cfg)
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()
	handler.StartAgentPreviewCleanup(ctx)
	handler.StartAgentTemplateCacheRefresh(ctx, cfg)

	log.Printf(
		"agent hub backend listening on :%s region=%s aiproxy=%s modelProxy=%s",
		cfg.Port,
		cfg.Region,
		cfg.AIProxyBaseURL,
		cfg.AIProxyModelBaseURL,
	)
	server := &http.Server{
		Addr:    ":" + cfg.Port,
		Handler: engine,
	}
	go func() {
		<-ctx.Done()
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if err := server.Shutdown(shutdownCtx); err != nil {
			log.Printf("agent hub backend shutdown error: %v", err)
		}
	}()
	if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatal(err)
	}
}
