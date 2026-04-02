package vtexhttp

import (
	"bytes"
	"context"
	"encoding/json"
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
		httpClient:  &gohttp.Client{Timeout: defaultTimeout},
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
			select {
			case <-ctx.Done():
				return 0, nil, ctx.Err()
			case <-time.After(delay):
			}
			slog.Info("vtex_http_retry",
				"action", "retry",
				"method", method,
				"path", path,
				"vtex_account", vtexAccount,
				"attempt", attempt+1,
				"delay_ms", delay.Milliseconds(),
			)
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
			// RetryOnTimeout: false means don't retry on any network error (non-idempotent safety).
			if !rc.RetryOnTimeout {
				return 0, nil, classifyError(method, path, 0, nil, lastErr)
			}
			if attempt < rc.MaxAttempts-1 {
				continue
			}
			return 0, nil, classifyError(method, path, 0, nil, lastErr)
		}

		respBody, readErr := io.ReadAll(resp.Body)
		resp.Body.Close()
		if readErr != nil {
			return resp.StatusCode, nil, fmt.Errorf("read response body: %w", readErr)
		}

		lastStatus = resp.StatusCode
		lastBody = respBody
		lastErr = nil

		if !isRetryableStatus(resp.StatusCode) || attempt == rc.MaxAttempts-1 {
			break
		}
	}

	if lastErr == nil {
		lastErr = classifyError(method, path, lastStatus, lastBody, nil)
	}

	return lastStatus, lastBody, lastErr
}

func jitteredDelay(base time.Duration, attempt int, jitterPct float64) time.Duration {
	exp := math.Pow(2, float64(attempt-1))
	delay := float64(base) * exp
	jitter := delay * jitterPct * (2*rand.Float64() - 1)
	result := time.Duration(delay + jitter)
	if result < 0 {
		result = 0
	}
	return result
}
