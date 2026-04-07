package melhorenvio

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	pricingports "marketplace-central/apps/server_core/internal/modules/pricing/ports"
)

const (
	defaultBaseURL = "https://melhorenvio.com.br/api/v2"
	defaultTimeout = 10 * time.Second
	userAgent      = "Marketplace Central"
)

type tokenGetter interface {
	GetToken(ctx context.Context) (string, error)
}

// InMemoryTokenStore is a lightweight test helper for client tests.
type InMemoryTokenStore struct {
	token string
}

func NewInMemoryTokenStore(token string) *InMemoryTokenStore {
	return &InMemoryTokenStore{token: token}
}

func (s *InMemoryTokenStore) GetToken(_ context.Context) (string, error) {
	return s.token, nil
}

// Client calls the Melhor Envio freight quote API.
type Client struct {
	tokens     tokenGetter
	httpClient *http.Client
	baseURL    string
}

var _ pricingports.FreightQuoter = (*Client)(nil)

func NewClient(tokens tokenGetter) *Client {
	return newClient(tokens, defaultBaseURL, &http.Client{Timeout: defaultTimeout})
}

func NewClientWithBaseURL(tokens tokenGetter, baseURL string) *Client {
	return newClient(tokens, baseURL, &http.Client{})
}

func newClient(tokens tokenGetter, baseURL string, httpClient *http.Client) *Client {
	return &Client{
		tokens:     tokens,
		httpClient: httpClient,
		baseURL:    baseURL,
	}
}

func (c *Client) IsConnected(ctx context.Context) (bool, error) {
	token, err := c.tokens.GetToken(ctx)
	if err != nil {
		return false, err
	}
	if strings.TrimSpace(token) == "" {
		return false, nil
	}
	return checkServices(ctx, c.httpClient, c.baseURL, token)
}

func (c *Client) QuoteFreight(ctx context.Context, req pricingports.FreightRequest) (map[string]pricingports.FreightResult, error) {
	token, err := c.tokens.GetToken(ctx)
	if err != nil {
		return nil, fmt.Errorf("melhorenvio get token: %w", err)
	}
	if token == "" {
		return nil, fmt.Errorf("melhorenvio not connected")
	}

	type meProduct struct {
		ID             string  `json:"id"`
		Width          float64 `json:"width"`
		Height         float64 `json:"height"`
		Length         float64 `json:"length"`
		Weight         float64 `json:"weight"`
		InsuranceValue float64 `json:"insurance_value"`
		Quantity       int     `json:"quantity"`
	}

	products := make([]meProduct, 0, len(req.Products))
	for _, product := range req.Products {
		products = append(products, meProduct{
			ID:             product.ProductID,
			Width:          product.WidthCM,
			Height:         product.HeightCM,
			Length:         product.LengthCM,
			Weight:         product.WeightKg,
			InsuranceValue: product.Value,
			Quantity:       1,
		})
	}

	body, err := json.Marshal(map[string]any{
		"from":     map[string]string{"postal_code": stripNonDigits(req.OriginCEP)},
		"to":       map[string]string{"postal_code": stripNonDigits(req.DestCEP)},
		"products": products,
	})
	if err != nil {
		return nil, fmt.Errorf("melhorenvio marshal request: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/me/shipment/calculate", bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("melhorenvio build request: %w", err)
	}
	httpReq.Header.Set("Authorization", "Bearer "+token)
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Accept", "application/json")
	httpReq.Header.Set("User-Agent", userAgent)

	resp, err := c.httpClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("melhorenvio quote request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("melhorenvio quote status: %d", resp.StatusCode)
	}

	var options []struct {
		CustomPrice float64         `json:"custom_price"`
		Price       float64         `json:"price"`
		Error       json.RawMessage `json:"error"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&options); err != nil {
		return nil, fmt.Errorf("melhorenvio decode response: %w", err)
	}

	lowestPrice := 0.0
	foundQuote := false
	for _, option := range options {
		hasError, err := hasQuoteError(option.Error)
		if err != nil {
			return nil, fmt.Errorf("melhorenvio parse option error: %w", err)
		}
		if hasError {
			continue
		}

		selectedPrice := option.CustomPrice
		if selectedPrice == 0 && option.Price > 0 {
			selectedPrice = option.Price
		}

		if !foundQuote || selectedPrice < lowestPrice {
			lowestPrice = selectedPrice
			foundQuote = true
		}
	}

	results := make(map[string]pricingports.FreightResult, len(req.Products))
	for _, product := range req.Products {
		if !foundQuote {
			results[product.ProductID] = pricingports.FreightResult{Amount: 0, Source: "me_error"}
			continue
		}
		results[product.ProductID] = pricingports.FreightResult{Amount: lowestPrice, Source: "melhor_envio"}
	}

	return results, nil
}

func stripNonDigits(value string) string {
	buf := make([]byte, 0, len(value))
	for i := 0; i < len(value); i++ {
		if value[i] >= '0' && value[i] <= '9' {
			buf = append(buf, value[i])
		}
	}
	return string(buf)
}

func hasQuoteError(raw json.RawMessage) (bool, error) {
	if len(raw) == 0 || string(raw) == "null" {
		return false, nil
	}

	var message string
	if err := json.Unmarshal(raw, &message); err == nil {
		return message != "", nil
	}

	return true, nil
}

func checkServices(ctx context.Context, httpClient *http.Client, baseURL, token string) (bool, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, baseURL+"/me/shipment/services", nil)
	if err != nil {
		return false, fmt.Errorf("melhorenvio build services request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", userAgent)

	resp, err := httpClient.Do(req)
	if err != nil {
		return false, fmt.Errorf("melhorenvio services request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return false, nil
	}
	return true, nil
}
