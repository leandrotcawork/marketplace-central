package vtexhttp

import (
	"fmt"
	"os"
)

// VTEXCredentials holds the API credentials for a VTEX account.
type VTEXCredentials struct {
	AppKey   string
	AppToken string
}

// CredentialProvider resolves VTEX API credentials for a given vtexAccount.
// Implement DatabaseCredentialProvider to load from marketplace_accounts table.
type CredentialProvider interface {
	GetCredentials(vtexAccount string) (VTEXCredentials, error)
}

// EnvCredentialProvider reads a single set of credentials from VTEX_APP_KEY and
// VTEX_APP_TOKEN environment variables. Suitable for development and
// single-account deployments.
type EnvCredentialProvider struct {
	appKey   string
	appToken string
}

// NewEnvCredentialProvider returns an error if VTEX_APP_KEY or VTEX_APP_TOKEN
// are not set.
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
