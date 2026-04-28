package main

import (
	"log"

	"github.com/nightwhite/Agent-Hub/internal/config"
	"github.com/nightwhite/Agent-Hub/internal/router"
)

func main() {
	cfg := config.Load()
	engine := router.New(cfg)

	log.Printf("agent hub backend listening on :%s", cfg.Port)
	if err := engine.Run(":" + cfg.Port); err != nil {
		log.Fatal(err)
	}
}
