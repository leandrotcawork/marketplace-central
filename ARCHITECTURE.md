# Marketplace Central Architecture

## Reference Baseline

This repository mirrors the structural rules of MetalShopping Final:

- GitHub: https://github.com/leandrotcawork/MetalShopping_Final (baseline commit: 847f7aebe32ea10e9a94dfde71ce42cc834aac2e)

## Frozen Decisions

- independent monorepo
- Go `apps/server_core`
- thin `apps/web`
- PostgreSQL canonical state
- single-tenant, tenant-ready
- modules: `catalog`, `marketplaces`, `pricing`
- stable routes without `/v1`
- future integrations only through ports and adapters
