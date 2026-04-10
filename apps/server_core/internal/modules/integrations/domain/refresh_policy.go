package domain

import (
	"errors"
	"time"
)

type ErrorClass int

const (
	ErrorClassTransient ErrorClass = iota
	ErrorClassTerminal
	ErrorClassClient
)

type RefreshPolicy struct {
	MaxConsecutiveFailures int
	BackoffBase            time.Duration
	BackoffMax             time.Duration
	CooldownAfterTerminal  time.Duration
}

func DefaultRefreshPolicy() RefreshPolicy {
	return RefreshPolicy{
		MaxConsecutiveFailures: 5,
		BackoffBase:            30 * time.Second,
		BackoffMax:             15 * time.Minute,
		CooldownAfterTerminal:  time.Hour,
	}
}

func (p RefreshPolicy) BackoffDuration(attempt int) time.Duration {
	if attempt <= 0 {
		return clampBackoff(p.BackoffBase, p.BackoffMax)
	}

	if p.BackoffBase <= 0 {
		return 0
	}

	delay := p.BackoffBase
	for i := 0; i < attempt; i++ {
		if delay >= p.BackoffMax && p.BackoffMax > 0 {
			return p.BackoffMax
		}
		delay *= 2
	}

	return clampBackoff(delay, p.BackoffMax)
}

func ClassifyRefreshError(err error) ErrorClass {
	switch {
	case errors.Is(err, ErrRefreshTokenInvalid), errors.Is(err, ErrRefreshMaxFailures):
		return ErrorClassTerminal
	case errors.Is(err, ErrRefreshRateLimited),
		errors.Is(err, ErrRefreshProviderError),
		errors.Is(err, ErrRefreshLockContention):
		return ErrorClassTransient
	default:
		return ErrorClassTransient
	}
}

func clampBackoff(delay, max time.Duration) time.Duration {
	if max > 0 && delay > max {
		return max
	}
	return delay
}
