package vtexhttp

import (
	"fmt"
	"os"
)

type VTEXCredentials struct {
	AppKey   string
	AppToken string
}

type CredentialProvider interface {
	GetCredentials(vtexAccount string) (VTEXCredentials, error)
}

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
