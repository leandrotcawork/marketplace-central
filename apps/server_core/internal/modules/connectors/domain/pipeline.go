package domain

import "time"

type PipelineStepResult struct {
	StepResultID string     `json:"step_result_id"`
	OperationID  string     `json:"operation_id"`
	TenantID     string     `json:"tenant_id"`
	StepName     string     `json:"step_name"`
	Status       string     `json:"status"`
	VTEXEntityID *string    `json:"vtex_entity_id,omitempty"`
	AttemptCount int        `json:"attempt_count"`
	ErrorCode    string     `json:"error_code,omitempty"`
	ErrorMessage string     `json:"error_message,omitempty"`
	StartedAt    *time.Time `json:"started_at,omitempty"`
	CompletedAt  *time.Time `json:"completed_at,omitempty"`
}

const (
	StepCategory    = "category"
	StepBrand       = "brand"
	StepProduct     = "product"
	StepSKU         = "sku"
	StepSpecsImages = "specs_images"
	StepTradePolicy = "trade_policy"
	StepPrice       = "price"
	StepStock       = "stock"
	StepActivate    = "activate"
)

// OrderedSteps defines the 9-step pipeline in execution order.
var OrderedSteps = []string{
	StepCategory,
	StepBrand,
	StepProduct,
	StepSKU,
	StepSpecsImages,
	StepTradePolicy,
	StepPrice,
	StepStock,
	StepActivate,
}

// SharedSteps are resolved once per batch, not per product.
var SharedSteps = []string{
	StepCategory,
	StepBrand,
}

// PerProductSteps run sequentially for each product after shared resolution.
var PerProductSteps = []string{
	StepProduct,
	StepSKU,
	StepSpecsImages,
	StepTradePolicy,
	StepPrice,
	StepStock,
	StepActivate,
}

const (
	StepStatusPending    = "pending"
	StepStatusInProgress = "in_progress"
	StepStatusSucceeded  = "succeeded"
	StepStatusFailed     = "failed"
	StepStatusSkipped    = "skipped"
)
