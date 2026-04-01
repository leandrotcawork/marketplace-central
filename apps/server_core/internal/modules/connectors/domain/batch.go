package domain

import "time"

type PublicationBatch struct {
	BatchID        string     `json:"batch_id"`
	TenantID       string     `json:"tenant_id"`
	VTEXAccount    string     `json:"vtex_account"`
	Status         string     `json:"status"`
	TotalProducts  int        `json:"total_products"`
	SucceededCount int        `json:"succeeded_count"`
	FailedCount    int        `json:"failed_count"`
	CreatedAt      time.Time  `json:"created_at"`
	CompletedAt    *time.Time `json:"completed_at,omitempty"`
}

type PublicationOperation struct {
	OperationID  string    `json:"operation_id"`
	BatchID      string    `json:"batch_id"`
	TenantID     string    `json:"tenant_id"`
	VTEXAccount  string    `json:"vtex_account"`
	ProductID    string    `json:"product_id"`
	CurrentStep  string    `json:"current_step"`
	Status       string    `json:"status"`
	ErrorCode    string    `json:"error_code,omitempty"`
	ErrorMessage string    `json:"error_message,omitempty"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

const (
	BatchStatusPending    = "pending"
	BatchStatusInProgress = "in_progress"
	BatchStatusCompleted  = "completed"
	BatchStatusFailed     = "failed"
)

const (
	OperationStatusPending    = "pending"
	OperationStatusInProgress = "in_progress"
	OperationStatusSucceeded  = "succeeded"
	OperationStatusFailed     = "failed"
)
