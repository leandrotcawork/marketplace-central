package domain

type TokenResult struct {
	AccessToken       string         `json:"access_token"`
	RefreshToken      string         `json:"refresh_token"`
	ExpiresIn         int            `json:"expires_in"`
	TokenType         string         `json:"token_type"`
	Scopes            []string       `json:"scopes"`
	ProviderAccountID string         `json:"provider_account_id"`
	RawExtras         map[string]any `json:"raw_extras,omitempty"`
}
