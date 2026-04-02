package vtexhttp

import "time"

type RetryConfig struct {
	MaxAttempts    int
	BaseDelay      time.Duration
	JitterPct      float64
	RetryOnTimeout bool // false = treat timeout as terminal (for non-idempotent POSTs)
}

// RetryOnTimeout: false marks operations where retrying on network ambiguity risks
// duplicate VTEX resource creation (no server-side idempotency key available).
// TODO: implement read-before-write reconciliation for category/brand/image to enable safe retry.
var retryConfigs = map[string]RetryConfig{
	"FindOrCreateCategory": {MaxAttempts: 5, BaseDelay: 1 * time.Second, JitterPct: 0.25, RetryOnTimeout: false},
	"FindOrCreateBrand":    {MaxAttempts: 5, BaseDelay: 1 * time.Second, JitterPct: 0.25, RetryOnTimeout: false},
	"CreateProduct":        {MaxAttempts: 3, BaseDelay: 2 * time.Second, JitterPct: 0.25, RetryOnTimeout: false},
	"CreateSKU":            {MaxAttempts: 3, BaseDelay: 2 * time.Second, JitterPct: 0.25, RetryOnTimeout: false},
	"AttachSpecsAndImages": {MaxAttempts: 3, BaseDelay: 1 * time.Second, JitterPct: 0.25, RetryOnTimeout: false},
	"AssociateTradePolicy": {MaxAttempts: 3, BaseDelay: 1 * time.Second, JitterPct: 0.25, RetryOnTimeout: true},
	"SetPrice":             {MaxAttempts: 2, BaseDelay: 2 * time.Second, JitterPct: 0.25, RetryOnTimeout: true},
	"SetStock":             {MaxAttempts: 2, BaseDelay: 2 * time.Second, JitterPct: 0.25, RetryOnTimeout: true},
	"ActivateProduct":      {MaxAttempts: 3, BaseDelay: 1 * time.Second, JitterPct: 0.25, RetryOnTimeout: true},
	"GetProduct":           {MaxAttempts: 3, BaseDelay: 1 * time.Second, JitterPct: 0.25, RetryOnTimeout: true},
	"GetSKU":               {MaxAttempts: 3, BaseDelay: 1 * time.Second, JitterPct: 0.25, RetryOnTimeout: true},
	"GetCategory":          {MaxAttempts: 3, BaseDelay: 1 * time.Second, JitterPct: 0.25, RetryOnTimeout: true},
	"GetBrand":             {MaxAttempts: 3, BaseDelay: 1 * time.Second, JitterPct: 0.25, RetryOnTimeout: true},
}
