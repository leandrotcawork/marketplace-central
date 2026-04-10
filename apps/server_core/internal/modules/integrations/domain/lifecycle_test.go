package domain

import "testing"

func TestCanTransitionInstallationStatusMatrix(t *testing.T) {
	t.Parallel()

	statuses := []InstallationStatus{
		InstallationStatusDraft,
		InstallationStatusPendingConnection,
		InstallationStatusConnected,
		InstallationStatusDegraded,
		InstallationStatusRequiresReauth,
		InstallationStatusDisconnected,
		InstallationStatusSuspended,
		InstallationStatusFailed,
	}

	want := map[InstallationStatus]map[InstallationStatus]bool{
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
			InstallationStatusDisconnected: true,
		},
		InstallationStatusDisconnected: {},
		InstallationStatusSuspended:    {},
		InstallationStatusFailed: {
			InstallationStatusDraft: true,
		},
	}

	for _, from := range statuses {
		from := from

		t.Run(string(from), func(t *testing.T) {
			t.Parallel()

			for _, to := range statuses {
				to := to

				t.Run(string(to), func(t *testing.T) {
					t.Parallel()

					got := CanTransitionInstallationStatus(from, to)
					wantTransition := want[from][to]
					if got != wantTransition {
						t.Fatalf("CanTransitionInstallationStatus(%q, %q) = %v, want %v", from, to, got, wantTransition)
					}
				})
			}
		})
	}
}
