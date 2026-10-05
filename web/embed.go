// Package web holds the built kid and parent screens.
package web

import (
	"embed"
	"io/fs"
)

//go:embed all:dist
var dist embed.FS

// Files returns the built app. Before `make build` it holds only .gitkeep.
func Files() fs.FS {
	f, err := fs.Sub(dist, "dist")
	if err != nil {
		panic(err)
	}
	return f
}
