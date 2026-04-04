package vtexhttp

import "time"

type RetryConfig struct {
	MaxAttempts    int
	BaseDelay      time.Duration
	JitterPct      float64
	AllowNetworkRetry bool // false = never retry on network errors (for non-idempotent writes where ambiguous state risks duplicate creation)
}

// AllowNetworkRetry: false marks operations where retrying on network ambiguity risks
// duplicate VTEX resource creation (no server-side idempotency key available).
// TODO: implement read-before-write reconciliation for category/brand/image to enable safe retry.
var retryConfigs = map[string]RetryConfig{
	"FindOrCreateCategory": {MaxAttempts: 5, BaseDelay: 1 * time.Second, JitterPct: 0.25, AllowNetworkRetry: false},
	"FindOrCreateBrand":    {MaxAttempts: 5, BaseDelay: 1 * time.Second, JitterPct: 0.25, AllowNetworkRetry: false},
	"CreateProduct":        {MaxAttempts: 3, BaseDelay: 2 * time.Second, JitterPct: 0.25, AllowNetworkRetry: false},
	"CreateSKU":            {MaxAttempts: 3, BaseDelay: 2 * time.Second, JitterPct: 0.25, AllowNetworkRetry: false},
	"AttachSpecsAndImages": {MaxAttempts: 3, BaseDelay: 1 * time.Second, JitterPct: 0.25, AllowNetworkRetry: false},
	"AssociateTradePolicy": {MaxAttempts: 3, BaseDelay: 1 * time.Second, JitterPct: 0.25, AllowNetworkRetry: true},
	"SetPrice":             {MaxAttempts: 2, BaseDelay: 2 * time.Second, JitterPct: 0.25, AllowNetworkRetry: true},
	"SetStock":             {MaxAttempts: 2, BaseDelay: 2 * time.Second, JitterPct: 0.25, AllowNetworkRetry: true},
	"ActivateProduct":      {MaxAttempts: 3, BaseDelay: 1 * time.Second, JitterPct: 0.25, AllowNetworkRetry: true},
	"GetProduct":           {MaxAttempts: 3, BaseDelay: 1 * time.Second, JitterPct: 0.25, AllowNetworkRetry: true},
	"GetSKU":               {MaxAttempts: 3, BaseDelay: 1 * time.Second, JitterPct: 0.25, AllowNetworkRetry: true},
	"GetCategory":          {MaxAttempts: 3, BaseDelay: 1 * time.Second, JitterPct: 0.25, AllowNetworkRetry: true},
	"GetBrand":             {MaxAttempts: 3, BaseDelay: 1 * time.Second, JitterPct: 0.25, AllowNetworkRetry: true},
	"ValidateConnection":   {MaxAttempts: 1, BaseDelay: 0, JitterPct: 0, AllowNetworkRetry: false},
}
