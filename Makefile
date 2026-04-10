.PHONY: server dev test go-test

server:
	export $$(grep -v '^#' .env | grep -v '^ *$$' | tr -d '\r' | xargs) && go run ./apps/server_core/cmd/server

dev:
	export $$(grep -v '^#' .env | grep -v '^ *$$' | tr -d '\r' | xargs) && go run ./apps/server_core/cmd/server &
	npm run dev --workspace=apps/web

test:
	npm run test --workspace=packages/ui
	npm run test --workspace=packages/feature-products
	npm run test --workspace=packages/feature-connectors
	npm run test --workspace=packages/feature-simulator
	npm run test --workspace=packages/feature-classifications

go-test:
	GOCACHE=$(abspath .gocache) go test ./apps/server_core/...
