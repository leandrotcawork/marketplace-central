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

.PHONY: wiki-lint wiki-index setup-hooks wiki-audit

wiki-lint:
	@python -m tools.wiki.lint; code=$$?; \
	  if [ $$code -ge 3 ]; then echo "[infra] wiki-lint tool crashed (exit=$$code)" >&2; exit $$code; fi; \
	  if [ $$code -eq 1 ]; then echo "[advisory] wiki-lint HARD findings present (M1 warn-only)"; exit 0; fi; \
	  if [ $$code -eq 2 ]; then echo "[advisory] wiki-lint WARN findings present"; exit 0; fi; \
	  exit 0

wiki-index:
	python -m tools.wiki.index

setup-hooks:
	@for h in pre-commit pre-push; do \
	  src=$$(pwd)/tools/wiki/hooks/$$h; \
	  dst=.git/hooks/$$h; \
	  if [ -e "$$dst" ] && [ ! -L "$$dst" ]; then \
	    echo "refuse: $$dst exists and is not a symlink"; exit 1; \
	  fi; \
	  ln -sfn "$$src" "$$dst"; \
	  chmod +x "$$src"; \
	  echo "linked $$dst -> $$src"; \
	done

wiki-audit:
	@echo "M5 target — not implemented yet"
