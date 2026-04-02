package vtexhttp

import (
	"context"
	"encoding/json"
	"io"
	gohttp "net/http"
	"strings"
	"testing"

	"marketplace-central/apps/server_core/internal/modules/connectors/ports"
)

type staticCredentialProvider struct{}

func (staticCredentialProvider) GetCredentials(string) (VTEXCredentials, error) {
	return VTEXCredentials{AppKey: "app-key", AppToken: "app-token"}, nil
}

type roundTripFunc func(*gohttp.Request) (*gohttp.Response, error)

func (f roundTripFunc) RoundTrip(req *gohttp.Request) (*gohttp.Response, error) {
	return f(req)
}

func TestAttachSpecsAndImagesReturnsErrorWhenImageListIsEmpty(t *testing.T) {
	adapter := &Adapter{}

	err := adapter.AttachSpecsAndImages(context.Background(), ports.SpecsImagesParams{
		VTEXSKUID: "sku-123",
	})
	if err == nil {
		t.Fatal("expected error for empty image list")
	}
	if !strings.Contains(err.Error(), "CONNECTORS_ATTACHSPECSANDIMAGES_EMPTY_IMAGES") {
		t.Fatalf("expected structured empty image error, got %v", err)
	}
}

func TestActivateProductFetchesCurrentProductBeforeFullPut(t *testing.T) {
	getCalls := 0
	putCalls := 0

	client := &Client{
		credentials: staticCredentialProvider{},
		httpClient: &gohttp.Client{
			Transport: roundTripFunc(func(req *gohttp.Request) (*gohttp.Response, error) {
				switch {
				case req.Method == gohttp.MethodGet && req.URL.Path == "/api/catalog/pvt/product/123":
					getCalls++
					return jsonResponse(gohttp.StatusOK, `{"Id":123,"Name":"Product A","CategoryId":11,"BrandId":22,"Description":"Product description","RefId":"local-123","IsVisible":true,"IsActive":false}`), nil
				case req.Method == gohttp.MethodPut && req.URL.Path == "/api/catalog/pvt/product/123":
					putCalls++

					body, err := io.ReadAll(req.Body)
					if err != nil {
						t.Fatalf("read put body: %v", err)
					}

					var payload vtexProductRequest
					if err := json.Unmarshal(body, &payload); err != nil {
						t.Fatalf("unmarshal put payload: %v", err)
					}

					if payload.Name != "Product A" || payload.CategoryId != 11 || payload.BrandId != 22 || payload.Description != "Product description" || payload.RefId != "local-123" || !payload.IsVisible || !payload.IsActive {
						return jsonResponse(gohttp.StatusBadRequest, `{"Message":"invalid payload"}`), nil
					}

					return jsonResponse(gohttp.StatusOK, `{}`), nil
				default:
					t.Fatalf("unexpected request: %s %s", req.Method, req.URL.String())
					return nil, nil
				}
			}),
		},
	}

	adapter := &Adapter{client: client}
	err := adapter.ActivateProduct(context.Background(), ports.ActivateParams{
		VTEXAccount:   "account",
		VTEXProductID: "123",
	})
	if err != nil {
		t.Fatalf("expected activation to succeed, got %v", err)
	}
	if getCalls != 1 {
		t.Fatalf("expected 1 GET call, got %d", getCalls)
	}
	if putCalls != 1 {
		t.Fatalf("expected 1 PUT call, got %d", putCalls)
	}
}

func jsonResponse(status int, body string) *gohttp.Response {
	return &gohttp.Response{
		StatusCode: status,
		Header:     make(gohttp.Header),
		Body:       io.NopCloser(strings.NewReader(body)),
	}
}
