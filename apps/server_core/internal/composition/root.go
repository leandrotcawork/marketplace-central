package composition

import (
	"net/http"

	catalogtransport "marketplace-central/apps/server_core/internal/modules/catalog/transport"
	marketplacestransport "marketplace-central/apps/server_core/internal/modules/marketplaces/transport"
	pricingtransport "marketplace-central/apps/server_core/internal/modules/pricing/transport"
	"marketplace-central/apps/server_core/internal/platform/httpx"
)

func NewRootRouter() http.Handler {
	mux := http.NewServeMux()

	base := httpx.NewRouter()
	mux.Handle("/healthz", base)

	catalogtransport.Handler{}.Register(mux)
	marketplacestransport.Handler{}.Register(mux)
	pricingtransport.Handler{}.Register(mux)

	return mux
}
