package application

const (
	statusHealthy  = "healthy"
	statusWarning  = "warning"
	statusCritical = "critical"

	criticalMarginThreshold = 0.10
	warningMarginThreshold  = 0.20
)

func simulationStatus(marginPercent float64, freightAvailable bool) string {
	if !freightAvailable {
		return statusCritical
	}
	if marginPercent < criticalMarginThreshold {
		return statusCritical
	}
	if marginPercent < warningMarginThreshold {
		return statusWarning
	}
	return statusHealthy
}
