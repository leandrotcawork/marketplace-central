package domain

import "time"

type OperationRun struct {
	OperationRunID string             `json:"operation_run_id"`
	TenantID       string             `json:"tenant_id"`
	InstallationID string             `json:"installation_id"`
	OperationType  string             `json:"operation_type"`
	Status         OperationRunStatus `json:"status"`
	ResultCode     string             `json:"result_code"`
	FailureCode    string             `json:"failure_code"`
	AttemptCount   int                `json:"attempt_count"`
	ActorType      string             `json:"actor_type"`
	ActorID        string             `json:"actor_id"`
	StartedAt      *time.Time         `json:"started_at,omitempty"`
	CompletedAt    *time.Time         `json:"completed_at,omitempty"`
	CreatedAt      time.Time          `json:"created_at"`
	UpdatedAt      time.Time          `json:"updated_at"`
}
