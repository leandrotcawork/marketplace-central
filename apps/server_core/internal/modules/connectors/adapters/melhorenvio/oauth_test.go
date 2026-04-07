package melhorenvio

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
)

type oauthTestStore struct {
	token       string
	getErr      error
	saveErr     error
	saveCtx     context.Context
	saveToken   string
	saveRefresh string
}

func (s *oauthTestStore) GetToken(ctx context.Context) (string, error) {
	s.saveCtx = ctx
	return s.token, s.getErr
}

func (s *oauthTestStore) SaveToken(ctx context.Context, accessToken, refreshToken string) error {
	s.saveCtx = ctx
	s.saveToken = accessToken
	s.saveRefresh = refreshToken
	return s.saveErr
}

type roundTripperFunc func(*http.Request) (*http.Response, error)

func (f roundTripperFunc) RoundTrip(req *http.Request) (*http.Response, error) {
	return f(req)
}

func newOAuthHandlerForTest(store oauthTokenStore, client *http.Client) *OAuthHandler {
	return &OAuthHandler{
		store:        store,
		clientID:     "client-id",
		clientSecret: "client-secret",
		redirectURI:  "http://localhost/callback",
		httpClient:   client,
	}
}

func decodeErrorBody(t *testing.T, body *bytes.Buffer) map[string]any {
	t.Helper()

	var payload map[string]any
	if err := json.NewDecoder(bytes.NewReader(body.Bytes())).Decode(&payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	return payload
}

func errorCodeFromResponse(t *testing.T, body *bytes.Buffer) string {
	t.Helper()

	payload := decodeErrorBody(t, body)
	errObj, ok := payload["error"].(map[string]any)
	if !ok {
		t.Fatalf("expected nested error object, got %#v", payload["error"])
	}
	code, _ := errObj["code"].(string)
	return code
}

type ioNopCloser struct {
	*bytes.Reader
}

func (ioNopCloser) Close() error { return nil }

func TestOAuthHandlerHandleStartRejectsNonGET(t *testing.T) {
	h := newOAuthHandlerForTest(&oauthTestStore{}, &http.Client{})

	req := httptest.NewRequest(http.MethodPost, "/connectors/melhor-envio/auth/start", nil)
	rec := httptest.NewRecorder()

	h.HandleStart(rec, req)

	if rec.Code != http.StatusMethodNotAllowed {
		t.Fatalf("expected 405, got %d", rec.Code)
	}
	if got := rec.Header().Get("Allow"); got != "GET" {
		t.Fatalf("expected Allow GET, got %q", got)
	}
	if code := errorCodeFromResponse(t, rec.Body); code != "CONNECTORS_ME_METHOD_NOT_ALLOWED" {
		t.Fatalf("expected CONNECTORS_ME_METHOD_NOT_ALLOWED, got %q", code)
	}
}

func TestOAuthHandlerHandleStartIssuesStateCookieAndRedirects(t *testing.T) {
	h := newOAuthHandlerForTest(&oauthTestStore{}, &http.Client{})

	req := httptest.NewRequest(http.MethodGet, "/connectors/melhor-envio/auth/start", nil)
	rec := httptest.NewRecorder()

	h.HandleStart(rec, req)

	if rec.Code != http.StatusFound {
		t.Fatalf("expected 302, got %d", rec.Code)
	}

	location := rec.Header().Get("Location")
	if location == "" {
		t.Fatal("expected redirect location")
	}

	parsed, err := url.Parse(location)
	if err != nil {
		t.Fatalf("parse redirect location: %v", err)
	}
	if parsed.Path != "/oauth/authorize" {
		t.Fatalf("expected authorize path, got %q", parsed.Path)
	}

	q := parsed.Query()
	if q.Get("state") == "" {
		t.Fatal("expected state query parameter")
	}
	if q.Get("client_id") != "client-id" {
		t.Fatalf("expected client_id client-id, got %q", q.Get("client_id"))
	}

	cookies := rec.Result().Cookies()
	if len(cookies) != 1 {
		t.Fatalf("expected one cookie, got %d", len(cookies))
	}
	if cookies[0].Name != meOAuthStateCookieName {
		t.Fatalf("expected state cookie %q, got %q", meOAuthStateCookieName, cookies[0].Name)
	}
	if cookies[0].Value == "" {
		t.Fatal("expected non-empty state cookie value")
	}
	if cookies[0].Value != q.Get("state") {
		t.Fatalf("expected cookie state to match redirect state, got cookie=%q query=%q", cookies[0].Value, q.Get("state"))
	}
}

func TestOAuthHandlerHandleCallbackRejectsNonGET(t *testing.T) {
	h := newOAuthHandlerForTest(&oauthTestStore{}, &http.Client{})

	req := httptest.NewRequest(http.MethodPost, "/connectors/melhor-envio/auth/callback", nil)
	rec := httptest.NewRecorder()

	h.HandleCallback(rec, req)

	if rec.Code != http.StatusMethodNotAllowed {
		t.Fatalf("expected 405, got %d", rec.Code)
	}
	if got := rec.Header().Get("Allow"); got != "GET" {
		t.Fatalf("expected Allow GET, got %q", got)
	}
	if code := errorCodeFromResponse(t, rec.Body); code != "CONNECTORS_ME_METHOD_NOT_ALLOWED" {
		t.Fatalf("expected CONNECTORS_ME_METHOD_NOT_ALLOWED, got %q", code)
	}
}

func TestOAuthHandlerHandleCallbackRejectsStateMismatch(t *testing.T) {
	h := newOAuthHandlerForTest(&oauthTestStore{}, &http.Client{})

	req := httptest.NewRequest(http.MethodGet, "/connectors/melhor-envio/auth/callback?code=abc&state=wrong", nil)
	req.AddCookie(&http.Cookie{Name: meOAuthStateCookieName, Value: "expected"})
	rec := httptest.NewRecorder()

	h.HandleCallback(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rec.Code)
	}
	if code := errorCodeFromResponse(t, rec.Body); code != "CONNECTORS_ME_STATE_MISMATCH" {
		t.Fatalf("expected CONNECTORS_ME_STATE_MISMATCH, got %q", code)
	}
}

func TestOAuthHandlerHandleCallbackRejectsMissingCode(t *testing.T) {
	h := newOAuthHandlerForTest(&oauthTestStore{}, &http.Client{})

	req := httptest.NewRequest(http.MethodGet, "/connectors/melhor-envio/auth/callback?state=expected", nil)
	req.AddCookie(&http.Cookie{Name: meOAuthStateCookieName, Value: "expected"})
	rec := httptest.NewRecorder()

	h.HandleCallback(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rec.Code)
	}
	if code := errorCodeFromResponse(t, rec.Body); code != "CONNECTORS_ME_CODE_MISSING" {
		t.Fatalf("expected CONNECTORS_ME_CODE_MISSING, got %q", code)
	}
}

func TestOAuthHandlerHandleCallbackSavesTokenAndUsesRequestContext(t *testing.T) {
	ctxKey := struct{}{}
	store := &oauthTestStore{}
	client := &http.Client{
		Transport: roundTripperFunc(func(req *http.Request) (*http.Response, error) {
			if got := req.Context().Value(ctxKey); got != "present" {
				t.Fatalf("expected request context value to propagate, got %v", got)
			}
			if req.Method != http.MethodPost {
				t.Fatalf("expected POST to token endpoint, got %s", req.Method)
			}

			buf := bytes.NewBufferString(`{"access_token":"access-123","refresh_token":"refresh-456"}`)
			return &http.Response{
				StatusCode: http.StatusOK,
				Body:       ioNopCloser{Reader: bytes.NewReader(buf.Bytes())},
				Header:     make(http.Header),
			}, nil
		}),
	}
	h := newOAuthHandlerForTest(store, client)

	req := httptest.NewRequest(http.MethodGet, "/connectors/melhor-envio/auth/callback?code=abc&state=expected", nil)
	req = req.WithContext(context.WithValue(req.Context(), ctxKey, "present"))
	req.AddCookie(&http.Cookie{Name: meOAuthStateCookieName, Value: "expected"})
	rec := httptest.NewRecorder()

	h.HandleCallback(rec, req)

	if rec.Code != http.StatusFound {
		t.Fatalf("expected 302, got %d", rec.Code)
	}
	if store.saveToken != "access-123" || store.saveRefresh != "refresh-456" {
		t.Fatalf("unexpected saved tokens: %#v", store)
	}
	if store.saveCtx == nil || store.saveCtx.Value(ctxKey) != "present" {
		t.Fatal("expected save token context to propagate")
	}
}

func TestOAuthHandlerHandleCallbackSurfacesSaveTokenError(t *testing.T) {
	store := &oauthTestStore{saveErr: errors.New("db unavailable")}
	client := &http.Client{
		Transport: roundTripperFunc(func(req *http.Request) (*http.Response, error) {
			buf := bytes.NewBufferString(`{"access_token":"access-123","refresh_token":"refresh-456"}`)
			return &http.Response{
				StatusCode: http.StatusOK,
				Body:       ioNopCloser{Reader: bytes.NewReader(buf.Bytes())},
				Header:     make(http.Header),
			}, nil
		}),
	}
	h := newOAuthHandlerForTest(store, client)

	req := httptest.NewRequest(http.MethodGet, "/connectors/melhor-envio/auth/callback?code=abc&state=expected", nil)
	req.AddCookie(&http.Cookie{Name: meOAuthStateCookieName, Value: "expected"})
	rec := httptest.NewRecorder()

	h.HandleCallback(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d", rec.Code)
	}
	if code := errorCodeFromResponse(t, rec.Body); code != "CONNECTORS_ME_TOKEN_SAVE_FAILED" {
		t.Fatalf("expected CONNECTORS_ME_TOKEN_SAVE_FAILED, got %q", code)
	}
}

func TestOAuthHandlerHandleStatusSurfacesStoreError(t *testing.T) {
	store := &oauthTestStore{getErr: errors.New("db unavailable")}
	h := newOAuthHandlerForTest(store, &http.Client{})

	req := httptest.NewRequest(http.MethodGet, "/connectors/melhor-envio/status", nil)
	rec := httptest.NewRecorder()

	h.HandleStatus(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d", rec.Code)
	}
	if code := errorCodeFromResponse(t, rec.Body); code != "CONNECTORS_ME_STATUS_STORE_FAILED" {
		t.Fatalf("expected CONNECTORS_ME_STATUS_STORE_FAILED, got %q", code)
	}
}

func TestOAuthHandlerHandleStatusReturnsFalseWhenServiceCheckFails(t *testing.T) {
	store := &oauthTestStore{token: "token-123"}
	client := &http.Client{Transport: roundTripperFunc(func(req *http.Request) (*http.Response, error) {
		return &http.Response{
			StatusCode: http.StatusUnauthorized,
			Body:       ioNopCloser{Reader: bytes.NewReader([]byte(`{}`))},
			Header:     make(http.Header),
		}, nil
	})}

	h := newOAuthHandlerForTest(store, client)
	req := httptest.NewRequest(http.MethodGet, "/connectors/melhor-envio/status", nil)
	rec := httptest.NewRecorder()

	h.HandleStatus(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	var payload map[string]bool
	if err := json.NewDecoder(rec.Body).Decode(&payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if payload["connected"] {
		t.Fatal("expected connected=false")
	}
}

func TestOAuthHandlerHandleStatusReturnsTrueWhenServiceCheckSucceeds(t *testing.T) {
	store := &oauthTestStore{token: "token-123"}
	client := &http.Client{Transport: roundTripperFunc(func(req *http.Request) (*http.Response, error) {
		if req.URL.Path != "/api/v2/me/shipment/services" {
			t.Fatalf("expected services path, got %q", req.URL.Path)
		}
		if got := req.Header.Get("Authorization"); got != "Bearer token-123" {
			t.Fatalf("expected bearer token header, got %q", got)
		}
		return &http.Response{
			StatusCode: http.StatusOK,
			Body:       ioNopCloser{Reader: bytes.NewReader([]byte(`{}`))},
			Header:     make(http.Header),
		}, nil
	})}

	h := newOAuthHandlerForTest(store, client)
	req := httptest.NewRequest(http.MethodGet, "/connectors/melhor-envio/status", nil)
	rec := httptest.NewRecorder()

	h.HandleStatus(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	var payload map[string]bool
	if err := json.NewDecoder(rec.Body).Decode(&payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if !payload["connected"] {
		t.Fatal("expected connected=true")
	}
}

func TestOAuthHandlerHandleCallbackSurfacesTokenExchangeFailure(t *testing.T) {
	store := &oauthTestStore{}
	client := &http.Client{
		Transport: roundTripperFunc(func(req *http.Request) (*http.Response, error) {
			return &http.Response{
				StatusCode: http.StatusBadGateway,
				Body:       ioNopCloser{Reader: bytes.NewReader([]byte(`{"error":"bad_gateway"}`))},
				Header:     make(http.Header),
			}, nil
		}),
	}
	h := newOAuthHandlerForTest(store, client)

	req := httptest.NewRequest(http.MethodGet, "/connectors/melhor-envio/auth/callback?code=abc&state=expected", nil)
	req.AddCookie(&http.Cookie{Name: meOAuthStateCookieName, Value: "expected"})
	rec := httptest.NewRecorder()

	h.HandleCallback(rec, req)

	if rec.Code != http.StatusBadGateway {
		t.Fatalf("expected 502, got %d", rec.Code)
	}
	if code := errorCodeFromResponse(t, rec.Body); code != "CONNECTORS_ME_TOKEN_EXCHANGE_FAILED" {
		t.Fatalf("expected CONNECTORS_ME_TOKEN_EXCHANGE_FAILED, got %q", code)
	}
}
