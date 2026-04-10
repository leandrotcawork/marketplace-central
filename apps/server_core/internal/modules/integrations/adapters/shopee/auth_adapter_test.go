package shopee

import (
	"context"
	"testing"

	"marketplace-central/apps/server_core/internal/modules/integrations/application"
)

func TestAdapterAcceptsAPIKeyCredential(t *testing.T) {
	t.Parallel()

	adapter := NewAdapter(Config{})

	credential, err := adapter.VerifyAPIKey(context.Background(), application.SubmitAPIKeyAdapterInput{
		InstallationID: "inst-shopee",
		APIKey:         "shopee-key",
		Metadata: map[string]string{
			"shop_id":   "shop-1",
			"shop_name": "Shopee Loja",
		},
	})
	if err != nil {
		t.Fatalf("VerifyAPIKey() error = %v", err)
	}
	if credential.SecretType != "api_key" {
		t.Fatalf("secret type = %q, want api_key", credential.SecretType)
	}
	if credential.ProviderAccountID != "shop-1" || credential.ProviderAccountName != "Shopee Loja" {
		t.Fatalf("credential account = %#v, want shop metadata", credential)
	}
	if credential.APIKey != "shopee-key" {
		t.Fatalf("api key = %q, want shopee-key", credential.APIKey)
	}
}

func TestAdapterRejectsBlankAPIKey(t *testing.T) {
	t.Parallel()

	adapter := NewAdapter(Config{})

	_, err := adapter.VerifyAPIKey(context.Background(), application.SubmitAPIKeyAdapterInput{
		InstallationID: "inst-shopee",
		APIKey:         " ",
	})
	if err == nil {
		t.Fatal("VerifyAPIKey() error = nil, want invalid credential error")
	}
}
