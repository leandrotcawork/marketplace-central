package domain

import "errors"

var (
	ErrVTEXValidation = errors.New("VTEX rejected the payload")
	ErrVTEXNotFound   = errors.New("VTEX resource not found")
	ErrVTEXTransient  = errors.New("VTEX transient error")
	ErrVTEXAuth       = errors.New("VTEX authentication failed")
)
