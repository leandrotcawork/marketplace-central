package vtexhttp

import (
	"encoding/json"
	"fmt"

	"marketplace-central/apps/server_core/internal/modules/connectors/domain"
)

func classifyError(method string, path string, statusCode int, body []byte, networkErr error) error {
	if networkErr != nil {
		return fmt.Errorf("VTEX network error on %s %s: %w: %w", method, path, networkErr, domain.ErrVTEXTransient)
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
	if len(body) == 0 {
		return "(empty response body)"
	}

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
