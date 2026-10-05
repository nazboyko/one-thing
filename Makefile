GO_PKGS := ./cmd/... ./internal/... ./web
WEB_DEPS := web/node_modules/.package-lock.json

.PHONY: dev build run test check web

$(WEB_DEPS): web/package.json web/package-lock.json
	cd web && npm ci

# Vite empties web/dist on every build, so the tracked placeholder comes back.
web: $(WEB_DEPS)
	cd web && npm run build
	touch web/dist/.gitkeep

build: web
	go build -o bin/onething ./cmd/onething

run: build
	./bin/onething

# Vite on :5173 with /api proxied to the Go server on :8787.
dev: $(WEB_DEPS)
	trap 'kill 0' EXIT; go run ./cmd/onething & (cd web && npm run dev); wait

test: $(WEB_DEPS)
	go test $(GO_PKGS)
	cd web && npm test

check: $(WEB_DEPS)
	@unformatted="$$(gofmt -l cmd internal web/embed.go)"; \
	if [ -n "$$unformatted" ]; then echo "gofmt needed:"; echo "$$unformatted"; exit 1; fi
	go vet $(GO_PKGS)
	go test $(GO_PKGS)
	cd web && npm run typecheck
	cd web && npm test
	$(MAKE) web
