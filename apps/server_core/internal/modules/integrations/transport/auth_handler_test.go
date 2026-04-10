package transport

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"marketplace-central/apps/server_core/internal/modules/integrations/application"
	"marketplace-central/apps/server_core/internal/modules/integrations/domain"
)

type stubAuthFlow struct {
	startInput    application.StartAuthorizeInput
	callbackInput application.HandleCallbackInput
	submitInput   application.SubmitAPIKeyInput
	statusInput   application.GetAuthStatusInput
}

func (s *stubAuthFlow) StartAuthorize(ctx context.Context, input application.StartAuthorizeInput) (application.AuthorizeStart, error) {
	s.startInput = input
	return application.AuthorizeStart{InstallationID: input.InstallationID, ProviderCode: "mercado_livre", State: "state-1", AuthURL: "https://provider.test/auth"}, nil
}

func (s *stubAuthFlow) HandleCallback(ctx context.Context, input application.HandleCallbackInput) (application.AuthStatus, error) {
	s.callbackInput = input
	return application.AuthStatus{InstallationID: "inst-from-state", Status: domain.InstallationStatusConnected}, nil
}

func (s *stubAuthFlow) SubmitAPIKey(ctx context.Context, input application.SubmitAPIKeyInput) (application.AuthStatus, error) {
	s.submitInput = input
	return application.AuthStatus{InstallationID: input.InstallationID, Status: domain.InstallationStatusConnected}, nil
}

func (s *stubAuthFlow) RefreshCredential(ctx context.Context, input application.RefreshCredentialInput) (application.AuthStatus, error) {
	return application.AuthStatus{InstallationID: input.InstallationID, Status: domain.InstallationStatusConnected}, nil
}

func (s *stubAuthFlow) Disconnect(ctx context.Context, input application.DisconnectInput) (application.AuthStatus, error) {
	return application.AuthStatus{InstallationID: input.InstallationID, Status: domain.InstallationStatusDisconnected}, nil
}

func (s *stubAuthFlow) StartReauth(ctx context.Context, input application.StartReauthInput) (application.AuthorizeStart, error) {
	return application.AuthorizeStart{InstallationID: input.InstallationID, ProviderCode: "mercado_livre", State: "state-2", AuthURL: "https://provider.test/reauth"}, nil
}

func (s *stubAuthFlow) GetAuthStatus(ctx context.Context, input application.GetAuthStatusInput) (application.AuthStatus, error) {
	s.statusInput = input
	return application.AuthStatus{InstallationID: input.InstallationID, Status: domain.InstallationStatusConnected}, nil
}

func TestAuthHandlerStartAuthorizeDelegatesToService(t *testing.T) {
	t.Parallel()

	flow := &stubAuthFlow{}
	handler := NewAuthHandler(flow)
	req := httptest.NewRequest(http.MethodPost, "/integrations/installations/inst-1/auth/authorize", bytes.NewReader([]byte(`{"redirect_uri":"https://app.test/callback","scopes":["read"]}`)))
	rr := httptest.NewRecorder()

	handler.handleInstallationAuth(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body=%s", rr.Code, rr.Body.String())
	}
	if flow.startInput.InstallationID != "inst-1" || flow.startInput.RedirectURI != "https://app.test/callback" {
		t.Fatalf("start input = %#v, want installation and redirect", flow.startInput)
	}

	var response application.AuthorizeStart
	if err := json.Unmarshal(rr.Body.Bytes(), &response); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if response.AuthURL == "" || response.State == "" {
		t.Fatalf("response = %#v, want auth URL and state", response)
	}
}

func TestAuthHandlerRejectsWrongMethod(t *testing.T) {
	t.Parallel()

	handler := NewAuthHandler(&stubAuthFlow{})
	req := httptest.NewRequest(http.MethodGet, "/integrations/installations/inst-1/auth/authorize", nil)
	rr := httptest.NewRecorder()

	handler.handleInstallationAuth(rr, req)

	if rr.Code != http.StatusMethodNotAllowed {
		t.Fatalf("status = %d, want 405", rr.Code)
	}
	if rr.Header().Get("Allow") != http.MethodPost {
		t.Fatalf("Allow = %q, want POST", rr.Header().Get("Allow"))
	}
}

func TestAuthHandlerCallbackAcceptsProviderCodeAndStateOnly(t *testing.T) {
	t.Parallel()

	flow := &stubAuthFlow{}
	handler := NewAuthHandler(flow)
	req := httptest.NewRequest(http.MethodGet, "/integrations/auth/callback?code=provider-code&state=signed-state", nil)
	rr := httptest.NewRecorder()

	handler.handleCallback(rr, req)

	if rr.Code != http.StatusFound {
		t.Fatalf("status = %d, want 302; body=%s", rr.Code, rr.Body.String())
	}
	if flow.callbackInput.InstallationID != "" || flow.callbackInput.Code != "provider-code" || flow.callbackInput.State != "signed-state" {
		t.Fatalf("callback input = %#v, want code/state without installation id", flow.callbackInput)
	}
	if location := rr.Header().Get("Location"); location != "/connections/inst-from-state?status=connected" {
		t.Fatalf("Location = %q, want service installation redirect", location)
	}
}

func TestAuthHandlerSubmitAPIKeyDelegatesToService(t *testing.T) {
	t.Parallel()

	flow := &stubAuthFlow{}
	handler := NewAuthHandler(flow)
	req := httptest.NewRequest(http.MethodPost, "/integrations/installations/inst-shopee/auth/credentials", bytes.NewReader([]byte(`{"api_key":"secret","metadata":{"shop_id":"shop-1"}}`)))
	rr := httptest.NewRecorder()

	handler.handleInstallationAuth(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body=%s", rr.Code, rr.Body.String())
	}
	if flow.submitInput.InstallationID != "inst-shopee" || flow.submitInput.APIKey != "secret" || flow.submitInput.Metadata["shop_id"] != "shop-1" {
		t.Fatalf("submit input = %#v, want api key payload", flow.submitInput)
	}
}
