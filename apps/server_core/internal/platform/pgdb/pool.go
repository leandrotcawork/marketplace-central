package pgdb

import "context"

type Pool struct{}

func NewPool(ctx context.Context, cfg Config) (*Pool, error) {
	return &Pool{}, nil
}
