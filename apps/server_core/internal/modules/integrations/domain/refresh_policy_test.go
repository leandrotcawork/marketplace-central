package domain

import (
	"errors"
	"testing"
	"time"
)

func TestClassifyRefreshError(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name string
		err  error
		want ErrorClass
	}{
		{
			name: "token invalid is terminal",
			err:  ErrRefreshTokenInvalid,
			want: ErrorClassTerminal,
		},
		{
			name: "max failures is terminal",
			err:  ErrRefreshMaxFailures,
			want: ErrorClassTerminal,
		},
		{
			name: "rate limited is transient",
			err:  ErrRefreshRateLimited,
			want: ErrorClassTransient,
		},
		{
			name: "provider error is transient",
			err:  ErrRefreshProviderError,
			want: ErrorClassTransient,
		},
		{
			name: "lock contention is transient",
			err:  ErrRefreshLockContention,
			want: ErrorClassTransient,
		},
		{
			name: "unknown errors default to transient",
			err:  errors.New("unknown"),
			want: ErrorClassTransient,
		},
	}

	for _, tc := range tests {
		tc := tc

		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			if got := ClassifyRefreshError(tc.err); got != tc.want {
				t.Fatalf("ClassifyRefreshError(%v) = %v, want %v", tc.err, got, tc.want)
			}
		})
	}
}

func TestDefaultRefreshPolicy(t *testing.T) {
	t.Parallel()

	policy := DefaultRefreshPolicy()

	if policy.MaxConsecutiveFailures != 5 {
		t.Fatalf("MaxConsecutiveFailures = %d, want 5", policy.MaxConsecutiveFailures)
	}
	if policy.BackoffBase != 30*time.Second {
		t.Fatalf("BackoffBase = %v, want 30s", policy.BackoffBase)
	}
	if policy.BackoffMax != 15*time.Minute {
		t.Fatalf("BackoffMax = %v, want 15m", policy.BackoffMax)
	}
	if policy.CooldownAfterTerminal != time.Hour {
		t.Fatalf("CooldownAfterTerminal = %v, want 1h", policy.CooldownAfterTerminal)
	}
}

func TestRefreshPolicyBackoffDuration(t *testing.T) {
	t.Parallel()

	policy := DefaultRefreshPolicy()

	if got := policy.BackoffDuration(0); got != 30*time.Second {
		t.Fatalf("BackoffDuration(0) = %v, want 30s", got)
	}
	if got := policy.BackoffDuration(4); got != 8*time.Minute {
		t.Fatalf("BackoffDuration(4) = %v, want 8m", got)
	}
	if got := policy.BackoffDuration(10); got != 15*time.Minute {
		t.Fatalf("BackoffDuration(10) = %v, want 15m", got)
	}
}
