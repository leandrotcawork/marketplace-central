# Implementation Plan: VTEX HTTP Adapter

**Spec:** `docs/superpowers/specs/2026-04-02-vtex-http-adapter-design.md`
**Scope:** Replace stub VTEX adapter with real HTTP adapter calling VTEX Catalog/Pricing/Logistics APIs
**Module:** `apps/server_core/internal/modules/connectors/adapters/vtex/http/`

---

## File Map

| File | Purpose | Dependencies |
|---|---|---|
| `http/config.go` | RetryConfig struct + per-method configs | None |
| `http/types.go` | VTEX API request/response JSON structs | None |
| `http/errors.go` | HTTP status → domain error classifier | `domain/errors.go` |
| `http/client.go` | HTTP wrapper with auth, timeout, jittered backoff | `config.go`, `errors.go` |
| `http/mapper.go` | Params ↔ VTEX payload converters | `ports/vtex_catalog.go`, `types.go` |
| `http/credentials.go` | CredentialProvider interface + EnvCredentialProvider | None |
| `http/adapter.go` | VTEXCatalogPort implementation (account-agnostic) | All above |
| `composition/root.go` | Wire HTTP adapter instead of stub | `http/adapter.go` |
| `tests/integration/vtex_adapter_test.go` | Step-by-step real VTEX tests | `http/adapter.go` |

**Key architectural decisions (from Codex review):**
1. Adapter is **account-agnostic** — uses `params.VTEXAccount` per-request, not a singleton account
2. Credentials loaded via **CredentialProvider** interface — EnvCredentialProvider for now, DB/vault later
3. VTEX config **NOT in pgdb** — separate credential provider loaded only in composition
4. POST creates (Product, SKU) **NOT retried on timeout** — only retry when VTEX returns a clear 5xx response body; timeouts are ambiguous (resource may have been created)
5. Specs in AttachSpecsAndImages **explicitly out of scope** — VTEX spec field API is complex, images are sufficient for MVP

---

## Tasks

### Task 1 — Create RetryConfig struct and per-method configs (`config.go`)

**Create** `apps/server_core/internal/modules/connectors/adapters/vtex/http/config.go`:

```go
package http

import "time"

type RetryConfig struct {
	MaxAttempts    int
	BaseDelay      time.Duration
	JitterPct      float64
	RetryOnTimeout bool // false = treat timeout as terminal (for non-idempotent POSTs)
}

var retryConfigs = map[string]RetryConfig{
	"FindOrCreateCategory":  {MaxAttempts: 5, BaseDelay: 1 * time.Second, JitterPct: 0.25, RetryOnTimeout: true},
	"FindOrCreateBrand":     {MaxAttempts: 5, BaseDelay: 1 * time.Second, JitterPct: 0.25, RetryOnTimeout: true},
	"CreateProduct":         {MaxAttempts: 3, BaseDelay: 2 * time.Second, JitterPct: 0.25, RetryOnTimeout: false},
	"CreateSKU":             {MaxAttempts: 3, BaseDelay: 2 * time.Second, JitterPct: 0.25, RetryOnTimeout: false},
	"AttachSpecsAndImages":  {MaxAttempts: 3, BaseDelay: 1 * time.Second, JitterPct: 0.25, RetryOnTimeout: true},
	"AssociateTradePolicy":  {MaxAttempts: 3, BaseDelay: 1 * time.Second, JitterPct: 0.25, RetryOnTimeout: true},
	"SetPrice":              {MaxAttempts: 2, BaseDelay: 2 * time.Second, JitterPct: 0.25, RetryOnTimeout: true},
	"SetStock":              {MaxAttempts: 2, BaseDelay: 2 * time.Second, JitterPct: 0.25, RetryOnTimeout: true},
	"ActivateProduct":       {MaxAttempts: 3, BaseDelay: 1 * time.Second, JitterPct: 0.25, RetryOnTimeout: true},
	"GetProduct":            {MaxAttempts: 3, BaseDelay: 1 * time.Second, JitterPct: 0.25, RetryOnTimeout: true},
	"GetSKU":                {MaxAttempts: 3, BaseDelay: 1 * time.Second, JitterPct: 0.25, RetryOnTimeout: true},
	"GetCategory":           {MaxAttempts: 3, BaseDelay: 1 * time.Second, JitterPct: 0.25, RetryOnTimeout: true},
	"GetBrand":              {MaxAttempts: 3, BaseDelay: 1 * time.Second, JitterPct: 0.25, RetryOnTimeout: true},
}
```

**Verify:** `cd apps/server_core && go build ./internal/modules/connectors/adapters/vtex/http/`
**Expected:** Compiles with no errors.

---

### Task 2 — Create VTEX API request/response types (`types.go`)

**Create** `apps/server_core/internal/modules/connectors/adapters/vtex/http/types.go`:

```go
package http

// --- Request types ---

type vtexCategoryRequest struct {
	Name     string `json:"Name"`
	IsActive bool   `json:"IsActive"`
}

type vtexBrandRequest struct {
	Name     string `json:"Name"`
	IsActive bool   `json:"IsActive"`
}

type vtexProductRequest struct {
	Name        string `json:"Name"`
	CategoryId  int    `json:"CategoryId"`
	BrandId     int    `json:"BrandId"`
	Description string `json:"Description"`
	IsVisible   bool   `json:"IsVisible"`
	IsActive    bool   `json:"IsActive"`
}

type vtexSKURequest struct {
	ProductId int    `json:"ProductId"`
	Name      string `json:"Name"`
	IsActive  bool   `json:"IsActive"`
	EAN       string `json:"Ean"`
}

type vtexImageRequest struct {
	IsMain bool   `json:"IsMain"`
	Label  string `json:"Label"`
	Name   string `json:"Name"`
	Url    string `json:"Url"`
}

type vtexPriceRequest struct {
	Markup      int              `json:"markup"`
	ListPrice   *float64         `json:"listPrice"`
	BasePrice   float64          `json:"basePrice"`
	FixedPrices []vtexFixedPrice `json:"fixedPrices,omitempty"`
}

type vtexFixedPrice struct {
	TradePolicyId string  `json:"tradePolicyId"`
	Value         float64 `json:"value"`
	MinQuantity   int     `json:"minQuantity"`
}

type vtexStockRequest struct {
	UnlimitedQuantity bool `json:"unlimitedQuantity"`
	Quantity          int  `json:"quantity"`
}

type vtexProductUpdateRequest struct {
	IsActive bool `json:"IsActive"`
}

// --- Response types ---

type vtexCategoryResponse struct {
	Id   int    `json:"Id"`
	Name string `json:"Name"`
}

type vtexBrandResponse struct {
	Id   int    `json:"Id"`
	Name string `json:"Name"`
}

type vtexProductResponse struct {
	Id       int    `json:"Id"`
	Name     string `json:"Name"`
	IsActive bool   `json:"IsActive"`
}

type vtexSKUResponse struct {
	Id        int    `json:"Id"`
	ProductId int    `json:"ProductId"`
	Name      string `json:"Name"`
	EAN       string `json:"Ean"`
	IsActive  bool   `json:"IsActive"`
}

type vtexErrorResponse struct {
	Message string `json:"Message"`
	Error   string `json:"error"`
}
```

**Verify:** `cd apps/server_core && go build ./internal/modules/connectors/adapters/vtex/http/`
**Expected:** Compiles with no errors.

---

### Task 3 — Create error classifier (`errors.go`)

**Create** `apps/server_core/internal/modules/connectors/adapters/vtex/http/errors.go`:

```go
package http

import (
	"encoding/json"
	"fmt"

	"marketplace-central/apps/server_core/internal/modules/connectors/domain"
)

func classifyError(method string, path string, statusCode int, body []byte, networkErr error) error {
	if networkErr != nil {
		return fmt.Errorf("VTEX network error on %s %s: %s: %w", method, path, networkErr.Error(), domain.ErrVTEXTransient)
	}

	vtexMsg := extractVTEXMessage(body)

	switch {
	case statusCode >= 200 && statusCode < 300:
		return nil
	case statusCode == 400:
		return fmt.Errorf("VTEX %d on %s %s: %s: %w", statusCode, method, path, vtexMsg, domain.ErrVTEXValidation)
	case statusCode == 401 || statusCode == 403:
		return fmt.Errorf("VTEX %d on %s %s: %s: %w", statusCode, method, path, vtexMsg, domain.ErrVTEXAuth)
	case statusCode == 404:
		return fmt.Errorf("VTEX %d on %s %s: %s: %w", statusCode, method, path, vtexMsg, domain.ErrVTEXNotFound)
	case statusCode == 429:
		return fmt.Errorf("VTEX %d on %s %s: rate limited: %w", statusCode, method, path, domain.ErrVTEXTransient)
	case statusCode >= 500:
		return fmt.Errorf("VTEX %d on %s %s: %s: %w", statusCode, method, path, vtexMsg, domain.ErrVTEXTransient)
	default:
		return fmt.Errorf("VTEX %d on %s %s: %s: %w", statusCode, method, path, vtexMsg, domain.ErrVTEXValidation)
	}
}

func isRetryableStatus(statusCode int) bool {
	switch statusCode {
	case 429, 500, 502, 503, 504:
		return true
	default:
		return false
	}
}

func extractVTEXMessage(body []byte) string {
	var resp vtexErrorResponse
	if err := json.Unmarshal(body, &resp); err == nil {
		if resp.Message != "" {
			return resp.Message
		}
		if resp.Error != "" {
			return resp.Error
		}
	}
	if len(body) > 200 {
		return string(body[:200])
	}
	return string(body)
}
```

**Verify:** `cd apps/server_core && go build ./internal/modules/connectors/adapters/vtex/http/`
**Expected:** Compiles with no errors.

---

### Task 4 — Create credential provider (`credentials.go`)

**Create** `apps/server_core/internal/modules/connectors/adapters/vtex/http/credentials.go`:

```go
package http

import (
	"fmt"
	"os"
)

// VTEXCredentials holds the API credentials for a VTEX account.
type VTEXCredentials struct {
	AppKey   string
	AppToken string
}

// CredentialProvider resolves VTEX API credentials for a given account.
// EnvCredentialProvider reads from env vars for now.
// Future: DatabaseCredentialProvider reads from marketplace_accounts table.
type CredentialProvider interface {
	GetCredentials(vtexAccount string) (VTEXCredentials, error)
}

// EnvCredentialProvider reads a single set of credentials from environment variables.
// Suitable for development and single-account deployments.
type EnvCredentialProvider struct {
	appKey   string
	appToken string
}

func NewEnvCredentialProvider() (*EnvCredentialProvider, error) {
	appKey := os.Getenv("VTEX_APP_KEY")
	appToken := os.Getenv("VTEX_APP_TOKEN")
	if appKey == "" || appToken == "" {
		return nil, fmt.Errorf("VTEX_APP_KEY and VTEX_APP_TOKEN are required")
	}
	return &EnvCredentialProvider{appKey: appKey, appToken: appToken}, nil
}

func (p *EnvCredentialProvider) GetCredentials(vtexAccount string) (VTEXCredentials, error) {
	return VTEXCredentials{AppKey: p.appKey, AppToken: p.appToken}, nil
}
```

**Verify:** `cd apps/server_core && go build ./internal/modules/connectors/adapters/vtex/http/`
**Expected:** Compiles with no errors.

---

### Task 5 — Create HTTP client with jittered backoff (`client.go`)

**Create** `apps/server_core/internal/modules/connectors/adapters/vtex/http/client.go`:

```go
package http

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"math"
	"math/rand/v2"
	gohttp "net/http"
	"time"
)

const defaultTimeout = 30 * time.Second

type Client struct {
	credentials CredentialProvider
	httpClient  *gohttp.Client
}

func NewClient(credentials CredentialProvider) *Client {
	return &Client{
		credentials: credentials,
		httpClient: &gohttp.Client{
			Timeout: defaultTimeout,
		},
	}
}

func baseURL(vtexAccount string) string {
	return fmt.Sprintf("https://%s.vtexcommercestable.com.br", vtexAccount)
}

func (c *Client) Get(ctx context.Context, vtexAccount, path string, rc RetryConfig) (int, []byte, error) {
	return c.do(ctx, vtexAccount, gohttp.MethodGet, path, nil, rc)
}

func (c *Client) Post(ctx context.Context, vtexAccount, path string, body any, rc RetryConfig) (int, []byte, error) {
	return c.do(ctx, vtexAccount, gohttp.MethodPost, path, body, rc)
}

func (c *Client) Put(ctx context.Context, vtexAccount, path string, body any, rc RetryConfig) (int, []byte, error) {
	return c.do(ctx, vtexAccount, gohttp.MethodPut, path, body, rc)
}

func (c *Client) do(ctx context.Context, vtexAccount, method, path string, body any, rc RetryConfig) (int, []byte, error) {
	creds, err := c.credentials.GetCredentials(vtexAccount)
	if err != nil {
		return 0, nil, fmt.Errorf("get VTEX credentials for %s: %w", vtexAccount, err)
	}

	url := baseURL(vtexAccount) + path

	var bodyBytes []byte
	if body != nil {
		var err error
		bodyBytes, err = json.Marshal(body)
		if err != nil {
			return 0, nil, fmt.Errorf("marshal request body: %w", err)
		}
	}

	var lastStatus int
	var lastBody []byte
	var lastErr error

	for attempt := 0; attempt < rc.MaxAttempts; attempt++ {
		if attempt > 0 {
			delay := jitteredDelay(rc.BaseDelay, attempt, rc.JitterPct)
			slog.Info("vtex_http_retry",
				"action", "retry",
				"method", method,
				"path", path,
				"vtex_account", vtexAccount,
				"attempt", attempt+1,
				"delay_ms", delay.Milliseconds(),
			)
			select {
			case <-ctx.Done():
				return 0, nil, ctx.Err()
			case <-time.After(delay):
			}
		}

		var reqBody io.Reader
		if bodyBytes != nil {
			reqBody = bytes.NewReader(bodyBytes)
		}

		req, err := gohttp.NewRequestWithContext(ctx, method, url, reqBody)
		if err != nil {
			return 0, nil, fmt.Errorf("create request: %w", err)
		}

		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Accept", "application/json")
		req.Header.Set("X-VTEX-API-AppKey", creds.AppKey)
		req.Header.Set("X-VTEX-API-AppToken", creds.AppToken)

		resp, err := c.httpClient.Do(req)
		if err != nil {
			lastErr = err
			lastStatus = 0
			lastBody = nil
			// Network/timeout error: only retry if config allows it
			isTimeout := errors.Is(err, context.DeadlineExceeded) || isTimeoutError(err)
			if isTimeout && !rc.RetryOnTimeout {
				return 0, nil, lastErr
			}
			if attempt < rc.MaxAttempts-1 {
				continue
			}
			return 0, nil, lastErr
		}

		respBody, err := io.ReadAll(resp.Body)
		resp.Body.Close()
		if err != nil {
			return resp.StatusCode, nil, fmt.Errorf("read response body: %w", err)
		}

		lastStatus = resp.StatusCode
		lastBody = respBody
		lastErr = nil

		if !isRetryableStatus(resp.StatusCode) || attempt == rc.MaxAttempts-1 {
			break
		}
	}

	return lastStatus, lastBody, lastErr
}

func isTimeoutError(err error) bool {
	type timeoutErr interface {
		Timeout() bool
	}
	var te timeoutErr
	return errors.As(err, &te) && te.Timeout()
}

func jitteredDelay(base time.Duration, attempt int, jitterPct float64) time.Duration {
	exp := math.Pow(2, float64(attempt-1))
	delay := float64(base) * exp
	jitter := delay * jitterPct * (2*rand.Float64() - 1)
	return time.Duration(delay + jitter)
}
```

**Verify:** `cd apps/server_core && go build ./internal/modules/connectors/adapters/vtex/http/`
**Expected:** Compiles with no errors.

---

### Task 6 — Create request/response mappers (`mapper.go`)

**Create** `apps/server_core/internal/modules/connectors/adapters/vtex/http/mapper.go`:

```go
package http

import (
	"encoding/json"
	"fmt"
	"strconv"

	"marketplace-central/apps/server_core/internal/modules/connectors/ports"
)

// --- To VTEX payload ---

func toVTEXCategoryPayload(p ports.CategoryParams) vtexCategoryRequest {
	return vtexCategoryRequest{Name: p.CategoryName, IsActive: true}
}

func toVTEXBrandPayload(p ports.BrandParams) vtexBrandRequest {
	return vtexBrandRequest{Name: p.BrandName, IsActive: true}
}

func toVTEXProductPayload(p ports.ProductParams) (vtexProductRequest, error) {
	catID, err := strconv.Atoi(p.VTEXCategoryID)
	if err != nil {
		return vtexProductRequest{}, fmt.Errorf("invalid VTEXCategoryID %q: %w", p.VTEXCategoryID, err)
	}
	brandID, err := strconv.Atoi(p.VTEXBrandID)
	if err != nil {
		return vtexProductRequest{}, fmt.Errorf("invalid VTEXBrandID %q: %w", p.VTEXBrandID, err)
	}
	return vtexProductRequest{
		Name:        p.Name,
		CategoryId:  catID,
		BrandId:     brandID,
		Description: p.Description,
		IsVisible:   true,
		IsActive:    false, // activated in step 9
	}, nil
}

func toVTEXSKUPayload(p ports.SKUParams) (vtexSKURequest, error) {
	prodID, err := strconv.Atoi(p.VTEXProductID)
	if err != nil {
		return vtexSKURequest{}, fmt.Errorf("invalid VTEXProductID %q: %w", p.VTEXProductID, err)
	}
	return vtexSKURequest{
		ProductId: prodID,
		Name:      p.Name,
		IsActive:  false,
		EAN:       p.EAN,
	}, nil
}

func toVTEXPricePayload(p ports.PriceParams) vtexPriceRequest {
	req := vtexPriceRequest{
		BasePrice: p.BasePrice,
	}
	if p.TradePolicyID != "" {
		req.FixedPrices = []vtexFixedPrice{{
			TradePolicyId: p.TradePolicyID,
			Value:         p.BasePrice,
			MinQuantity:   1,
		}}
	}
	return req
}

func toVTEXStockPayload(p ports.StockParams) vtexStockRequest {
	return vtexStockRequest{
		UnlimitedQuantity: false,
		Quantity:          p.Quantity,
	}
}

// --- From VTEX response ---

func fromVTEXIDResponse(body []byte, label string) (string, error) {
	var resp struct {
		Id int `json:"Id"`
	}
	if err := json.Unmarshal(body, &resp); err != nil {
		return "", fmt.Errorf("unmarshal %s response: %w", label, err)
	}
	if resp.Id == 0 {
		return "", fmt.Errorf("%s response missing Id field", label)
	}
	return strconv.Itoa(resp.Id), nil
}

func fromVTEXProductDataResponse(body []byte) (ports.ProductData, error) {
	var resp vtexProductResponse
	if err := json.Unmarshal(body, &resp); err != nil {
		return ports.ProductData{}, fmt.Errorf("unmarshal product response: %w", err)
	}
	return ports.ProductData{
		VTEXID: strconv.Itoa(resp.Id),
		Name:   resp.Name,
		Active: resp.IsActive,
	}, nil
}

func fromVTEXSKUDataResponse(body []byte) (ports.SKUData, error) {
	var resp vtexSKUResponse
	if err := json.Unmarshal(body, &resp); err != nil {
		return ports.SKUData{}, fmt.Errorf("unmarshal SKU response: %w", err)
	}
	return ports.SKUData{
		VTEXID:    strconv.Itoa(resp.Id),
		Name:      resp.Name,
		EAN:       resp.EAN,
		Active:    resp.IsActive,
		ProductID: strconv.Itoa(resp.ProductId),
	}, nil
}

func fromVTEXCategoryDataResponse(body []byte) (ports.CategoryData, error) {
	var resp vtexCategoryResponse
	if err := json.Unmarshal(body, &resp); err != nil {
		return ports.CategoryData{}, fmt.Errorf("unmarshal category response: %w", err)
	}
	return ports.CategoryData{
		VTEXID: strconv.Itoa(resp.Id),
		Name:   resp.Name,
	}, nil
}

func fromVTEXBrandDataResponse(body []byte) (ports.BrandData, error) {
	var resp vtexBrandResponse
	if err := json.Unmarshal(body, &resp); err != nil {
		return ports.BrandData{}, fmt.Errorf("unmarshal brand response: %w", err)
	}
	return ports.BrandData{
		VTEXID: strconv.Itoa(resp.Id),
		Name:   resp.Name,
	}, nil
}
```

**Verify:** `cd apps/server_core && go build ./internal/modules/connectors/adapters/vtex/http/`
**Expected:** Compiles with no errors.

---

### Task 7 — Create the adapter implementing VTEXCatalogPort (`adapter.go`)

**Create** `apps/server_core/internal/modules/connectors/adapters/vtex/http/adapter.go`:

The adapter is account-agnostic. Each method reads `params.VTEXAccount` to build the URL and resolve credentials per-request.

```go
package http

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"marketplace-central/apps/server_core/internal/modules/connectors/ports"
)

var _ ports.VTEXCatalogPort = (*Adapter)(nil)

type Adapter struct {
	client *Client
}

func NewAdapter(credentials CredentialProvider) *Adapter {
	return &Adapter{
		client: NewClient(credentials),
	}
}

func (a *Adapter) FindOrCreateCategory(ctx context.Context, params ports.CategoryParams) (string, error) {
	start := time.Now()
	payload := toVTEXCategoryPayload(params)
	path := "/api/catalog/pvt/category"
	rc := retryConfigs["FindOrCreateCategory"]

	status, body, netErr := a.client.Post(ctx, params.VTEXAccount, path, payload, rc)
	if err := classifyError("POST", path, status, body, netErr); err != nil {
		return "", err
	}
	vtexID, err := fromVTEXIDResponse(body, "category")
	slog.Info("vtex_api_call", "action", "FindOrCreateCategory", "result", resultStr(err), "duration_ms", time.Since(start).Milliseconds())
	return vtexID, err
}

func (a *Adapter) FindOrCreateBrand(ctx context.Context, params ports.BrandParams) (string, error) {
	start := time.Now()
	payload := toVTEXBrandPayload(params)
	path := "/api/catalog/pvt/brand"
	rc := retryConfigs["FindOrCreateBrand"]

	status, body, netErr := a.client.Post(ctx, params.VTEXAccount, path, payload, rc)
	if err := classifyError("POST", path, status, body, netErr); err != nil {
		return "", err
	}
	vtexID, err := fromVTEXIDResponse(body, "brand")
	slog.Info("vtex_api_call", "action", "FindOrCreateBrand", "result", resultStr(err), "duration_ms", time.Since(start).Milliseconds())
	return vtexID, err
}

func (a *Adapter) CreateProduct(ctx context.Context, params ports.ProductParams) (string, error) {
	start := time.Now()
	payload, err := toVTEXProductPayload(params)
	if err != nil {
		return "", err
	}
	path := "/api/catalog/pvt/product"
	rc := retryConfigs["CreateProduct"]

	status, body, netErr := a.client.Post(ctx, params.VTEXAccount, path, payload, rc)
	if err := classifyError("POST", path, status, body, netErr); err != nil {
		return "", err
	}
	vtexID, err := fromVTEXIDResponse(body, "product")
	slog.Info("vtex_api_call", "action", "CreateProduct", "result", resultStr(err), "duration_ms", time.Since(start).Milliseconds())
	return vtexID, err
}

func (a *Adapter) CreateSKU(ctx context.Context, params ports.SKUParams) (string, error) {
	start := time.Now()
	payload, err := toVTEXSKUPayload(params)
	if err != nil {
		return "", err
	}
	path := "/api/catalog/pvt/stockkeepingunit"
	rc := retryConfigs["CreateSKU"]

	status, body, netErr := a.client.Post(ctx, params.VTEXAccount, path, payload, rc)
	if err := classifyError("POST", path, status, body, netErr); err != nil {
		return "", err
	}
	vtexID, err := fromVTEXIDResponse(body, "sku")
	slog.Info("vtex_api_call", "action", "CreateSKU", "result", resultStr(err), "duration_ms", time.Since(start).Milliseconds())
	return vtexID, err
}

func (a *Adapter) AttachSpecsAndImages(ctx context.Context, params ports.SpecsImagesParams) error {
	start := time.Now()
	rc := retryConfigs["AttachSpecsAndImages"]

	// Images only for MVP. Specs require VTEX spec field API (complex, out of scope).
	for i, url := range params.ImageURLs {
		imgPayload := vtexImageRequest{
			IsMain: i == 0,
			Label:  fmt.Sprintf("image_%d", i+1),
			Name:   fmt.Sprintf("image_%d", i+1),
			Url:    url,
		}
		path := fmt.Sprintf("/api/catalog/pvt/stockkeepingunit/%s/file", params.VTEXSKUID)
		status, body, netErr := a.client.Post(ctx, params.VTEXAccount, path, imgPayload, rc)
		if err := classifyError("POST", path, status, body, netErr); err != nil {
			return err
		}
	}

	slog.Info("vtex_api_call", "action", "AttachSpecsAndImages", "result", "succeeded", "image_count", len(params.ImageURLs), "duration_ms", time.Since(start).Milliseconds())
	return nil
}

func (a *Adapter) AssociateTradePolicy(ctx context.Context, params ports.TradePolicyParams) error {
	start := time.Now()
	path := fmt.Sprintf("/api/catalog/pvt/product/%s/salespolicy/%s", params.VTEXProductID, params.TradePolicyID)
	rc := retryConfigs["AssociateTradePolicy"]

	status, body, netErr := a.client.Post(ctx, params.VTEXAccount, path, nil, rc)
	if err := classifyError("POST", path, status, body, netErr); err != nil {
		return err
	}
	slog.Info("vtex_api_call", "action", "AssociateTradePolicy", "result", "succeeded", "duration_ms", time.Since(start).Milliseconds())
	return nil
}

func (a *Adapter) SetPrice(ctx context.Context, params ports.PriceParams) error {
	start := time.Now()
	payload := toVTEXPricePayload(params)
	path := fmt.Sprintf("/api/pricing/prices/%s", params.VTEXSKUID)
	rc := retryConfigs["SetPrice"]

	status, body, netErr := a.client.Put(ctx, params.VTEXAccount, path, payload, rc)
	if err := classifyError("PUT", path, status, body, netErr); err != nil {
		return err
	}
	slog.Info("vtex_api_call", "action", "SetPrice", "result", "succeeded", "duration_ms", time.Since(start).Milliseconds())
	return nil
}

func (a *Adapter) SetStock(ctx context.Context, params ports.StockParams) error {
	start := time.Now()
	payload := toVTEXStockPayload(params)
	path := fmt.Sprintf("/api/logistics/pvt/inventory/skus/%s/warehouses/%s", params.VTEXSKUID, params.WarehouseID)
	rc := retryConfigs["SetStock"]

	status, body, netErr := a.client.Put(ctx, params.VTEXAccount, path, payload, rc)
	if err := classifyError("PUT", path, status, body, netErr); err != nil {
		return err
	}
	slog.Info("vtex_api_call", "action", "SetStock", "result", "succeeded", "duration_ms", time.Since(start).Milliseconds())
	return nil
}

func (a *Adapter) ActivateProduct(ctx context.Context, params ports.ActivateParams) error {
	start := time.Now()
	payload := vtexProductUpdateRequest{IsActive: true}
	path := fmt.Sprintf("/api/catalog/pvt/product/%s", params.VTEXProductID)
	rc := retryConfigs["ActivateProduct"]

	status, body, netErr := a.client.Put(ctx, params.VTEXAccount, path, payload, rc)
	if err := classifyError("PUT", path, status, body, netErr); err != nil {
		return err
	}
	slog.Info("vtex_api_call", "action", "ActivateProduct", "result", "succeeded", "duration_ms", time.Since(start).Milliseconds())
	return nil
}

func (a *Adapter) GetProduct(ctx context.Context, vtexAccount, vtexID string) (ports.ProductData, error) {
	path := fmt.Sprintf("/api/catalog/pvt/product/%s", vtexID)
	rc := retryConfigs["GetProduct"]

	status, body, netErr := a.client.Get(ctx, vtexAccount, path, rc)
	if err := classifyError("GET", path, status, body, netErr); err != nil {
		return ports.ProductData{}, err
	}
	return fromVTEXProductDataResponse(body)
}

func (a *Adapter) GetSKU(ctx context.Context, vtexAccount, vtexID string) (ports.SKUData, error) {
	path := fmt.Sprintf("/api/catalog/pvt/stockkeepingunit/%s", vtexID)
	rc := retryConfigs["GetSKU"]

	status, body, netErr := a.client.Get(ctx, vtexAccount, path, rc)
	if err := classifyError("GET", path, status, body, netErr); err != nil {
		return ports.SKUData{}, err
	}
	return fromVTEXSKUDataResponse(body)
}

func (a *Adapter) GetCategory(ctx context.Context, vtexAccount, vtexID string) (ports.CategoryData, error) {
	path := fmt.Sprintf("/api/catalog/pvt/category/%s", vtexID)
	rc := retryConfigs["GetCategory"]

	status, body, netErr := a.client.Get(ctx, vtexAccount, path, rc)
	if err := classifyError("GET", path, status, body, netErr); err != nil {
		return ports.CategoryData{}, err
	}
	return fromVTEXCategoryDataResponse(body)
}

func (a *Adapter) GetBrand(ctx context.Context, vtexAccount, vtexID string) (ports.BrandData, error) {
	path := fmt.Sprintf("/api/catalog/pvt/brand/%s", vtexID)
	rc := retryConfigs["GetBrand"]

	status, body, netErr := a.client.Get(ctx, vtexAccount, path, rc)
	if err := classifyError("GET", path, status, body, netErr); err != nil {
		return ports.BrandData{}, err
	}
	return fromVTEXBrandDataResponse(body)
}

func resultStr(err error) string {
	if err != nil {
		return "failed"
	}
	return "succeeded"
}
```

**Verify:** `cd apps/server_core && go build ./internal/modules/connectors/adapters/vtex/http/`
**Expected:** Compiles. Compile-time check `var _ ports.VTEXCatalogPort = (*Adapter)(nil)` passes.

---

### Task 8 — Wire HTTP adapter in composition (`root.go`)

**Edit** `apps/server_core/internal/composition/root.go`:

Replace import:
```go
// Remove:
connectorsstub "marketplace-central/apps/server_core/internal/modules/connectors/adapters/vtex/stub"
// Add:
connectorshttp "marketplace-central/apps/server_core/internal/modules/connectors/adapters/vtex/http"
```

Replace wiring:
```go
// Remove:
vtexAdapter := connectorsstub.NewAdapter()
// Add:
vtexCredentials, err := connectorshttp.NewEnvCredentialProvider()
if err != nil {
    log.Fatalf("vtex credentials: %v", err)
}
vtexAdapter := connectorshttp.NewAdapter(vtexCredentials)
```

This requires changing `NewRootRouter` signature to return `(http.Handler, error)` or using `log.Fatalf` inline. Since the existing pattern uses the function in `main.go` with `log.Fatal`, use `log.Fatalf` inline for consistency.

Add `"log"` to imports.

**Verify:** `cd apps/server_core && go build ./...`
**Expected:** Compiles with no errors. Note: unit tests that don't set VTEX env vars will fail at this point — addressed in Task 9.

---

### Task 9 — Fix unit tests for new credential requirement

The existing connector unit tests (`tests/unit/connectors_*.go`) use stubs directly and do NOT go through `composition/root.go`, so they should compile and pass without changes.

However, if `tests/unit/router_registration_test.go` exists and calls `composition.NewRootRouter()`, it will fail because `VTEX_APP_KEY`/`VTEX_APP_TOKEN` are not set. Fix by adding `t.Setenv` in that test's setup:

```go
t.Setenv("VTEX_APP_KEY", "test-key")
t.Setenv("VTEX_APP_TOKEN", "test-token")
```

**Verify:** `cd apps/server_core && go test ./tests/unit/... -v`
**Expected:** All existing tests pass.

---

### Task 10 — Commit adapter code

**Stage:**
```bash
git add apps/server_core/internal/modules/connectors/adapters/vtex/http/
git add apps/server_core/internal/composition/root.go
git add apps/server_core/tests/unit/
```

**Commit:** `feat(connectors): implement VTEX HTTP adapter with jittered backoff retry`

---

### Task 11 — Create step-by-step integration test file

**Create** `apps/server_core/tests/integration/vtex_adapter_test.go` with build tag `//go:build integration`.

10 test functions (`TestStep01_CreateCategory` through `TestStep10_GetProduct`). Each:
- Reads `VTEX_APP_KEY`, `VTEX_APP_TOKEN`, `VTEX_ACCOUNT` from env
- Skips if missing
- Calls one adapter method
- Logs request/response for manual review
- Later steps read `TEST_VTEX_CATEGORY_ID`, `TEST_VTEX_BRAND_ID`, etc. from env (set manually from previous step output)

Full code provided in spec. Uses `//go:build integration` tag so `go test ./...` never runs them accidentally.

**Run manually:** `cd apps/server_core && go test -tags integration ./tests/integration/... -run TestStep01 -v`

**Verify:** `cd apps/server_core && go build -tags integration ./tests/integration/...`
**Expected:** Compiles. Tests skip without credentials.

---

### Task 12 — Commit integration tests

**Commit:** `test(connectors): add step-by-step VTEX integration tests`
