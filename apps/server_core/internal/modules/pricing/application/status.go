package application

const (
	statusHealthy  = "healthy"
	statusWarning  = "warning"
	statusCritical = "critical"

	batchCriticalMarginThreshold = 0.10
	batchWarningMarginThreshold  = 0.20
)

func simulationStatusForSingle(marginPercent, minMarginPercent float64) string {
	if marginPercent < minMarginPercent {
		return statusWarning
	}
	return statusHealthy
}

func simulationStatusForBatch(marginPercent float64, freightAvailable bool) string {
	if !freightAvailable {
		return statusCritical
	}
	if marginPercent < batchCriticalMarginThreshold {
		return statusCritical
	}
	if marginPercent <= batchWarningMarginThreshold {
		return statusWarning
	}
	return statusHealthy
}
