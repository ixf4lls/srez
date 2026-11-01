package main

import (
	"context"
	"hh-analytics/internal/server"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"
)

func env(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}
func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	store, err := server.NewStore(ctx, env("DATABASE_URL", "postgres://hh:hh-local-development@localhost:5432/hh_analytics?sslmode=disable"))
	if err != nil {
		log.Fatal(err)
	}
	defer store.DB.Close()
	app := server.New(store, server.NewRunner(env("RUNNER_URL", "http://localhost:8091")))
	if err = app.Recover(ctx); err != nil {
		log.Fatal(err)
	}
	httpServer := &http.Server{Addr: ":" + env("PORT", "8080"), Handler: app.Handler(), ReadHeaderTimeout: 10 * time.Second, IdleTimeout: 90 * time.Second}
	go func() {
		log.Printf("API ready on %s", httpServer.Addr)
		if e := httpServer.ListenAndServe(); e != nil && e != http.ErrServerClosed {
			log.Fatal(e)
		}
	}()
	<-ctx.Done()
	app.Jobs.Shutdown()
	shutdown, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	_ = httpServer.Shutdown(shutdown)
}
