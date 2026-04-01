package composition

import (
	"net/http"

	catalogtransport "marketplace-central/apps/server_core/internal/modules/catalog/transport"
	marketplacespostgres "marketplace-central/apps/server_core/internal/modules/marketplaces/adapters/postgres"
	marketplacesapp "marketplace-central/apps/server_core/internal/modules/marketplaces/application"
	marketplacestransport "marketplace-central/apps/server_core/internal/modules/marketplaces/transport"
	pricingpostgres "marketplace-central/apps/server_core/internal/modules/pricing/adapters/postgres"
	pricingapp "marketplace-central/apps/server_core/internal/modules/pricing/application"
	pricingtransport "marketplace-central/apps/server_core/internal/modules/pricing/transport"
	"marketplace-central/apps/server_core/internal/platform/httpx"
	"marketplace-central/apps/server_core/internal/platform/pgdb"

	"github.com/jackc/pgx/v5/pgxpool"
)

func NewRootRouter(pool *pgxpool.Pool, cfg pgdb.Config) http.Handler {
	mux := http.NewServeMux()

	base := httpx.NewRouter()
	mux.Handle("/healthz", base)

	catalogtransport.Handler{}.Register(mux)

	marketRepo := marketplacespostgres.NewRepository(pool, cfg.DefaultTenantID)
	marketSvc := marketplacesapp.NewService(marketRepo, cfg.DefaultTenantID)
	marketplacestransport.NewHandler(marketSvc).Register(mux)

	pricingRepo := pricingpostgres.NewRepository()
	pricingSvc := pricingapp.NewService(pricingRepo, cfg.DefaultTenantID)
	pricingtransport.NewHandler(pricingSvc).Register(mux)

	return mux
}
