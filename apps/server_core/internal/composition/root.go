package composition

import (
	"context"
	"log"
	"log/slog"
	"net/http"
	"os"
	"time"

	catalogmetalshopping "marketplace-central/apps/server_core/internal/modules/catalog/adapters/metalshopping"
	catalogpostgres "marketplace-central/apps/server_core/internal/modules/catalog/adapters/postgres"
	catalogapp "marketplace-central/apps/server_core/internal/modules/catalog/application"
	catalogtransport "marketplace-central/apps/server_core/internal/modules/catalog/transport"
	classpostgres "marketplace-central/apps/server_core/internal/modules/classifications/adapters/postgres"
	classapp "marketplace-central/apps/server_core/internal/modules/classifications/application"
	classtransport "marketplace-central/apps/server_core/internal/modules/classifications/transport"
	connmagalu "marketplace-central/apps/server_core/internal/modules/connectors/adapters/magalu"
	melhorenvio "marketplace-central/apps/server_core/internal/modules/connectors/adapters/melhorenvio"
	connml "marketplace-central/apps/server_core/internal/modules/connectors/adapters/mercado_livre"
	connectorspostgres "marketplace-central/apps/server_core/internal/modules/connectors/adapters/postgres"
	connshopee "marketplace-central/apps/server_core/internal/modules/connectors/adapters/shopee"
	connectorshttp "marketplace-central/apps/server_core/internal/modules/connectors/adapters/vtex/http"
	connectorsapp "marketplace-central/apps/server_core/internal/modules/connectors/application"
	connectorstransport "marketplace-central/apps/server_core/internal/modules/connectors/transport"
	integrationscrypto "marketplace-central/apps/server_core/internal/modules/integrations/adapters/crypto"
	integrationsmagalu "marketplace-central/apps/server_core/internal/modules/integrations/adapters/magalu"
	integrationsml "marketplace-central/apps/server_core/internal/modules/integrations/adapters/mercadolivre"
	integrationspostgres "marketplace-central/apps/server_core/internal/modules/integrations/adapters/postgres"
	integrationsproviders "marketplace-central/apps/server_core/internal/modules/integrations/adapters/providers"
	integrationsshopee "marketplace-central/apps/server_core/internal/modules/integrations/adapters/shopee"
	integrationsapp "marketplace-central/apps/server_core/internal/modules/integrations/application"
	integrationsbg "marketplace-central/apps/server_core/internal/modules/integrations/background"
	integrationstransport "marketplace-central/apps/server_core/internal/modules/integrations/transport"
	marketplacespostgres "marketplace-central/apps/server_core/internal/modules/marketplaces/adapters/postgres"
	marketplacesapp "marketplace-central/apps/server_core/internal/modules/marketplaces/application"
	marketplacesregistry "marketplace-central/apps/server_core/internal/modules/marketplaces/registry"
	marketplacestransport "marketplace-central/apps/server_core/internal/modules/marketplaces/transport"
	pricingcatalog "marketplace-central/apps/server_core/internal/modules/pricing/adapters/catalog"
	pricingfee "marketplace-central/apps/server_core/internal/modules/pricing/adapters/feeschedule"
	pricingmarket "marketplace-central/apps/server_core/internal/modules/pricing/adapters/marketplace"
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

	providerRepo := integrationspostgres.NewProviderDefinitionRepository(pool)
	providerSvc := integrationsapp.NewProviderService(providerRepo)
	providerRegistry := integrationsproviders.NewRegistry()

	if pool != nil {
		if err := providerSvc.SeedProviderDefinitions(context.Background(), providerRegistry.All()); err != nil {
			slog.Warn("integration provider definitions seed failed", "err", err)
		}
	}

	installationRepo := integrationspostgres.NewInstallationRepository(pool, cfg.DefaultTenantID)
	installationSvc := integrationsapp.NewInstallationService(installationRepo, cfg.DefaultTenantID)
	credentialRepo := integrationspostgres.NewCredentialRepository(pool, cfg.DefaultTenantID)
	credentialSvc := integrationsapp.NewCredentialService(credentialRepo, cfg.DefaultTenantID)
	authSessionRepo := integrationspostgres.NewAuthSessionRepository(pool, cfg.DefaultTenantID)
	authSvc := integrationsapp.NewAuthService(authSessionRepo, cfg.DefaultTenantID)
	capabilityStateRepo := integrationspostgres.NewCapabilityStateRepository(pool, cfg.DefaultTenantID)
	capabilitySvc := integrationsapp.NewCapabilityService(capabilityStateRepo, cfg.DefaultTenantID)
	operationRunRepo := integrationspostgres.NewOperationRunRepository(pool, cfg.DefaultTenantID)
	operationSvc := integrationsapp.NewOperationService(operationRunRepo, cfg.DefaultTenantID)
	oauthStateRepo := integrationspostgres.NewOAuthStateRepository(pool, cfg.DefaultTenantID)

	_ = capabilitySvc
	_ = operationSvc
	_ = oauthStateRepo

	encryptionSvc, err := integrationscrypto.NewLocalKeyService(cfg.EncryptionKey, "local-key-v1")
	if err != nil {
		log.Fatalf("encryption service: %v", err)
	}

	mlAuth := integrationsml.NewAdapter(integrationsml.Config{
		ClientID:     os.Getenv("MPC_PROVIDER_MERCADOLIVRE_CLIENT_ID"),
		ClientSecret: os.Getenv("MPC_PROVIDER_MERCADOLIVRE_CLIENT_SECRET"),
		AuthorizeURL: "https://auth.mercadolivre.com.br/authorization",
		TokenURL:     "https://api.mercadolibre.com/oauth/token",
	})
	magaluAuth := integrationsmagalu.NewAdapter(integrationsmagalu.Config{
		ClientID:     os.Getenv("MPC_PROVIDER_MAGALU_CLIENT_ID"),
		ClientSecret: os.Getenv("MPC_PROVIDER_MAGALU_CLIENT_SECRET"),
		AuthorizeURL: "https://auth.magalu.com/oauth/authorize",
		TokenURL:     "https://auth.magalu.com/oauth/token",
	})
	shopeeAuth := integrationsshopee.NewAdapter(integrationsshopee.Config{})

	authFlowSvc := integrationsapp.NewAuthFlowService(integrationsapp.AuthFlowConfig{
		Installations: installationSvc,
		Credentials:   credentialSvc,
		AuthSessions:  authSvc,
		Encryptor:     encryptionSvc,
		Adapters: []integrationsapp.MarketplaceAuthAdapter{
			mlAuth,
			magaluAuth,
			shopeeAuth,
		},
	})

	integrationstransport.NewHandler(providerSvc, installationSvc).Register(mux)
	integrationstransport.NewAuthHandler(authFlowSvc).Register(mux)

	go integrationsbg.NewRefreshTicker(installationSvc, authFlowSvc, 5*time.Minute).Start(context.Background())
	go integrationsbg.NewStateCleanup(installationSvc, time.Hour).Start(context.Background())

	marketRepo := marketplacespostgres.NewRepository(pool, cfg.DefaultTenantID)
	marketSvc := marketplacesapp.NewService(marketRepo, cfg.DefaultTenantID)

	feeRepo := marketplacespostgres.NewFeeScheduleRepository(pool)
	feeSvc := marketplacesapp.NewFeeScheduleService(feeRepo)

	if pool != nil {
		if err := feeSvc.SeedDefinitions(context.Background()); err != nil {
			slog.Warn("marketplace definitions sync failed", "err", err)
		}
	}

	feeSyncSvc := connectorsapp.NewFeeSyncService(feeRepo,
		connml.NewFeeSyncer(),
		connshopee.NewFeeSyncer(),
		connmagalu.NewFeeSyncer(),
	)

	if pool != nil {
		go func() {
			ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
			defer cancel()
			feeSyncSvc.SeedAll(ctx)
		}()
	}

	// Seed stub fee rows for channels without a dedicated FeeSyncer (Amazon, Leroy, Madeira).
	if pool != nil {
		go func() {
			start := time.Now()
			ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
			defer cancel()
			slog.Info("registry.SeedAll started", "action", "seed_stub_fees")
			marketplacesregistry.SeedAll(ctx, pool)
			slog.Info("registry.SeedAll completed", "action", "seed_stub_fees", "result", "ok", "duration_ms", time.Since(start).Milliseconds())
		}()
	}

	marketplacestransport.NewHandler(marketSvc, feeSvc, feeSyncSvc).Register(mux)

	pricingRepo := pricingpostgres.NewRepository(pool, cfg.DefaultTenantID)
	pricingSvc := pricingapp.NewService(pricingRepo, cfg.DefaultTenantID)

	// Melhor Envio
	meTokenStore := melhorenvio.NewTokenStore(pool, cfg.DefaultTenantID)
	meClient := melhorenvio.NewClient(meTokenStore)
	meOAuth := melhorenvio.NewOAuthHandlerFromEnv(meTokenStore) // nil if ME_CLIENT_ID unset

	// Pricing batch orchestrator
	feeAdapter := pricingfee.NewAdapter(feeSvc)
	prodReader := pricingcatalog.NewReader(catalogSvc)
	polReader := pricingmarket.NewReader(marketSvc)
	batchOrch := pricingapp.NewBatchOrchestrator(prodReader, polReader, meClient, feeAdapter, cfg.DefaultTenantID)
	pricingtransport.NewHandler(pricingSvc, batchOrch).Register(mux)

	// Connectors (VTEX + ME auth)
	vtexCredentials, err := connectorshttp.NewEnvCredentialProvider()
	if err != nil {
		log.Fatalf("vtex credentials: %v", err)
	}
	connectorsRepo := connectorspostgres.NewRepository(pool, cfg.DefaultTenantID)
	vtexAdapter := connectorshttp.NewAdapter(vtexCredentials)
	connectorsOrch := connectorsapp.NewBatchOrchestrator(connectorsRepo, vtexAdapter, cfg.DefaultTenantID)
	connectorstransport.NewHandler(connectorsOrch, meOAuth).Register(mux)

	return httpx.CORSMiddleware(mux)
}
