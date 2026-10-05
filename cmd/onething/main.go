// Command onething serves the One Thing mission board.
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"

	"github.com/nazboyko/one-thing/internal/httpapi"
	"github.com/nazboyko/one-thing/internal/llm"
	"github.com/nazboyko/one-thing/internal/store"
	"github.com/nazboyko/one-thing/web"
)

func main() {
	addr := flag.String("addr", env("ADDR", ":8787"), "address to listen on")
	dataDir := flag.String("data", env("DATA_DIR", "./data"), "folder for saved missions")
	ollamaURL := flag.String("ollama", env("OLLAMA_URL", "http://localhost:11434"), "Ollama server URL")
	model := flag.String("model", env("OLLAMA_MODEL", "gemma4:e4b"), "model tag in Ollama")
	flag.Parse()

	if err := run(*addr, *dataDir, *ollamaURL, *model); err != nil {
		log.Fatal(err)
	}
}

func run(addr, dataDir, ollamaURL, model string) error {
	st, err := store.New(dataDir)
	if err != nil {
		return err
	}
	ln, err := net.Listen("tcp", addr)
	if err != nil {
		return err
	}
	tcp := ln.Addr().(*net.TCPAddr)
	lan := lanURLs(tcp)

	api := &httpapi.Server{
		Store:   st,
		Model:   llm.NewOllama(ollamaURL, model),
		LANURLs: lan,
		Web:     web.Files(),
	}
	srv := &http.Server{
		Handler:           api.Handler(),
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      5 * time.Minute, // generation may retry once
	}

	fmt.Printf("One Thing is running.\n")
	fmt.Printf("  On this laptop: http://localhost:%d/\n", tcp.Port)
	for _, u := range lan {
		fmt.Printf("  On the tablet:  %s\n", u)
	}
	fmt.Printf("  Model: %s at %s\n", model, ollamaURL)
	fmt.Printf("  Missions are saved in %s\n", dataDir)

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	errc := make(chan error, 1)
	go func() { errc <- srv.Serve(ln) }()

	select {
	case err := <-errc:
		return err
	case <-ctx.Done():
	}
	shutdown, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdown); err != nil && !errors.Is(err, http.ErrServerClosed) {
		return err
	}
	return nil
}

// lanURLs lists the addresses a tablet on the home network can open. A
// server bound to loopback has none.
func lanURLs(bound *net.TCPAddr) []string {
	port := strconv.Itoa(bound.Port)
	if bound.IP.IsLoopback() {
		return nil
	}
	if !bound.IP.IsUnspecified() {
		return []string{"http://" + net.JoinHostPort(bound.IP.String(), port) + "/"}
	}
	addrs, err := net.InterfaceAddrs()
	if err != nil {
		return nil
	}
	var urls []string
	for _, a := range addrs {
		ipnet, ok := a.(*net.IPNet)
		if !ok {
			continue
		}
		ip := ipnet.IP.To4()
		if ip == nil || ip.IsLoopback() || ip.IsLinkLocalUnicast() || !ip.IsPrivate() {
			continue
		}
		urls = append(urls, "http://"+net.JoinHostPort(ip.String(), port)+"/")
	}
	return urls
}

func env(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
