package composition

import (
	"log"
	"net/http"

	catalogmetalshopping "marketplace-central/apps/server_core/internal/modules/catalog/adapters/metalshopping"
	catalogpostgres "marketplace-central/apps/server_core/internal/modules/catalog/adapters/postgres"
	catalogapp "marketplace-central/apps/server_core/internal/modules/catalog/application"
	catalogtransport "marketplace-central/apps/server_core/internal/modules/catalog/transport"
	classpostgres "marketplace-central/apps/server_core/internal/modules/classifications/adapters/postgres"
	classapp "marketplace-central/apps/server_core/internal/modules/classifications/application"
	classtransport "marketplace-central/apps/server_core/internal/modules/classifications/transport"
	connectorsmelhorenvio "marketplace-central/apps/server_core/internal/modules/connectors/adapters/melhorenvio"
	connectorspostgres "marketplace-central/apps/server_core/internal/modules/connectors/adapters/postgres"
	connectorshttp "marketplace-central/apps/server_core/internal/modules/connectors/adapters/vtex/http"
	connectorsapp "marketplace-central/apps/server_core/internal/modules/connectors/application"
	connectorstransport "marketplace-central/apps/server_core/internal/modules/connectors/transport"
	marketplacespostgres "marketplace-central/apps/server_core/internal/modules/marketplaces/adapters/postgres"
	marketplacesapp "marketplace-central/apps/server_core/internal/modules/marketplaces/application"
	marketplacestransport "marketplace-central/apps/server_core/internal/modules/marketplaces/transport"
	pricingcatalog "marketplace-central/apps/server_core/internal/modules/pricing/adapters/catalog"
	pricingmarketplace "marketplace-central/apps/server_core/internal/modules/pricing/adapters/marketplace"
	pricingpostgres "marketplace-central/apps/server_core/internal/modules/pricing/adapters/postgres"
	pricingapp "marketplace-central/apps/server_core/internal/modules/pricing/application"
	pricingtransport "marketplace-central/apps/server_core/internal/modules/pricing/transport"
	"marketplace-central/apps/server_core/internal/platform/httpx"
	"marketplace-central/apps/server_core/internal/platform/pgdb"

	"github.com/jackc/pgx/v5/pgxpool"
)

func NewRootRouter(pool *pgxpool.Pool, msPool *pgxpool.Pool, cfg pgdb.Config) http.Handler {
	mux := http.NewServeMux()

	base := httpx.NewRouter()
	mux.Handle("/healthz", base)

	catalogReader := catalogmetalshopping.NewRepository(msPool)
	catalogEnrichments := catalogpostgres.NewEnrichmentRepository(pool, cfg.DefaultTenantID)
	catalogSvc := catalogapp.NewService(catalogReader, catalogEnrichments, cfg.DefaultTenantID)
	catalogtransport.Handler{Service: catalogSvc}.Register(mux)

	classRepo := classpostgres.NewRepository(pool, cfg.DefaultTenantID)
	classSvc := classapp.NewService(classRepo, cfg.DefaultTenantID)
	classtransport.NewHandler(classSvc).Register(mux)

	marketRepo := marketplacespostgres.NewRepository(pool, cfg.DefaultTenantID)
	marketSvc := marketplacesapp.NewService(marketRepo, cfg.DefaultTenantID)
	marketplacestransport.NewHandler(marketSvc).Register(mux)

	pricingRepo := pricingpostgres.NewRepository(pool, cfg.DefaultTenantID)
	pricingSvc := pricingapp.NewService(pricingRepo, cfg.DefaultTenantID)

	vtexCredentials, err := connectorshttp.NewEnvCredentialProvider()
	if err != nil {
		log.Fatalf("vtex credentials: %v", err)
	}

	meOAuthStore := connectorsmelhorenvio.NewTokenStore(pool, cfg.DefaultTenantID)
	batchOrch := pricingapp.NewBatchOrchestrator(
		pricingcatalog.NewReader(catalogSvc),
		pricingmarketplace.NewReader(marketSvc),
		connectorsmelhorenvio.NewClient(meOAuthStore),
		cfg.DefaultTenantID,
	)
	pricingtransport.NewHandler(pricingSvc, batchOrch).Register(mux)

	connectorsRepo := connectorspostgres.NewRepository(pool, cfg.DefaultTenantID)
	vtexAdapter := connectorshttp.NewAdapter(vtexCredentials)
	connectorsOrch := connectorsapp.NewBatchOrchestrator(connectorsRepo, vtexAdapter, cfg.DefaultTenantID)
	connectorstransport.NewHandler(connectorsOrch).Register(mux)

	if meOAuth := connectorsmelhorenvio.NewOAuthHandlerFromEnv(meOAuthStore); meOAuth != nil {
		meOAuth.Register(mux)
	}

	return httpx.CORSMiddleware(mux)
}
