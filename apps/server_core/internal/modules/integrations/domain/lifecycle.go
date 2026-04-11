package domain

type IntegrationFamily string
type AuthStrategy string
type InstallMode string
type InstallationStatus string
type CapabilityStatus string
type AuthState string
type HealthStatus string
type OperationRunStatus string

const (
	IntegrationFamilyMarketplace IntegrationFamily = "marketplace"

	AuthStrategyOAuth2  AuthStrategy = "oauth2"
	AuthStrategyAPIKey  AuthStrategy = "api_key"
	AuthStrategyToken   AuthStrategy = "token"
	AuthStrategyNone    AuthStrategy = "none"
	AuthStrategyUnknown AuthStrategy = "unknown"

	InstallModeInteractive InstallMode = "interactive"
	InstallModeManual      InstallMode = "manual"
	InstallModeHybrid      InstallMode = "hybrid"

	InstallationStatusDraft             InstallationStatus = "draft"
	InstallationStatusPendingConnection InstallationStatus = "pending_connection"
	InstallationStatusConnected         InstallationStatus = "connected"
	InstallationStatusDegraded          InstallationStatus = "degraded"
	InstallationStatusRequiresReauth    InstallationStatus = "requires_reauth"
	InstallationStatusDisconnected      InstallationStatus = "disconnected"
	InstallationStatusSuspended         InstallationStatus = "suspended"
	InstallationStatusFailed            InstallationStatus = "failed"

	CapabilityStatusEnabled        CapabilityStatus = "enabled"
	CapabilityStatusDegraded       CapabilityStatus = "degraded"
	CapabilityStatusDisabled       CapabilityStatus = "disabled"
	CapabilityStatusRequiresReauth CapabilityStatus = "requires_reauth"
	CapabilityStatusUnsupported    CapabilityStatus = "unsupported"

	AuthStateValid         AuthState = "valid"
	AuthStateExpiring      AuthState = "expiring"
	AuthStateInvalid       AuthState = "invalid"
	AuthStateRefreshFailed AuthState = "refresh_failed"

	HealthStatusHealthy  HealthStatus = "healthy"
	HealthStatusWarning  HealthStatus = "warning"
	HealthStatusCritical HealthStatus = "critical"

	OperationRunStatusQueued    OperationRunStatus = "queued"
	OperationRunStatusRunning   OperationRunStatus = "running"
	OperationRunStatusSucceeded OperationRunStatus = "succeeded"
	OperationRunStatusFailed    OperationRunStatus = "failed"
	OperationRunStatusCancelled OperationRunStatus = "cancelled"
)

var installationTransitions = map[InstallationStatus]map[InstallationStatus]bool{
	InstallationStatusDraft: {
		InstallationStatusPendingConnection: true,
	},
	InstallationStatusPendingConnection: {
		InstallationStatusConnected: true,
		InstallationStatusFailed:    true,
	},
	InstallationStatusConnected: {
		InstallationStatusDegraded:       true,
		InstallationStatusRequiresReauth: true,
		InstallationStatusDisconnected:   true,
		InstallationStatusSuspended:      true,
	},
	InstallationStatusDegraded: {
		InstallationStatusConnected:      true,
		InstallationStatusRequiresReauth: true,
	},
	InstallationStatusRequiresReauth: {
		InstallationStatusPendingConnection: true,
		InstallationStatusDisconnected:      true,
	},
	InstallationStatusFailed: {
		InstallationStatusDraft: true,
	},
}

func CanTransitionInstallationStatus(from, to InstallationStatus) bool {
	next, ok := installationTransitions[from]
	if !ok {
		return false
	}

	return next[to]
}
