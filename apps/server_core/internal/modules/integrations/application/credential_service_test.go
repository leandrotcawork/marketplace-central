package application

import (
	"context"
	"reflect"
	"testing"
	"time"

	"marketplace-central/apps/server_core/internal/modules/integrations/domain"
)

type stubCredentialStore struct {
	saved   []domain.Credential
	version int
}

func (s *stubCredentialStore) SaveCredentialVersion(_ context.Context, cred domain.Credential) error {
	s.saved = append(s.saved, cred)
	return nil
}

func (s *stubCredentialStore) NextCredentialVersion(_ context.Context, installationID string) (int, error) {
	if s.version == 0 {
		return len(s.saved) + 1, nil
	}

	return s.version, nil
}

type stubAuthSessionStore struct {
	saved []domain.AuthSession
}

func (s *stubAuthSessionStore) UpsertAuthSession(_ context.Context, session domain.AuthSession) error {
	s.saved = append(s.saved, session)
	return nil
}

type stubOperationRunStore struct {
	saved []domain.OperationRun
}

func (s *stubOperationRunStore) SaveOperationRun(_ context.Context, run domain.OperationRun) error {
	s.saved = append(s.saved, run)
	return nil
}

func TestRotateCredentialCreatesNewVersion(t *testing.T) {
	t.Parallel()

	store := &stubCredentialStore{}
	svc := NewCredentialService(store, "tenant-default")

	cred, err := svc.Rotate(context.Background(), RotateCredentialInput{
		CredentialID:     "cred_001",
		InstallationID:   "inst_001",
		SecretType:       "oauth_client",
		EncryptedPayload: []byte("ciphertext"),
		EncryptionKeyID:  "kek_1",
	})
	if err != nil {
		t.Fatalf("Rotate() error = %v", err)
	}

	if cred.Version != 1 {
		t.Fatalf("credential version = %d, want 1", cred.Version)
	}
	if cred.TenantID != "tenant-default" {
		t.Fatalf("tenant_id = %q, want %q", cred.TenantID, "tenant-default")
	}
	if len(store.saved) != 1 {
		t.Fatalf("saved credentials = %d, want 1", len(store.saved))
	}
	if got := store.saved[0]; got.CredentialID != "cred_001" || got.InstallationID != "inst_001" || got.Version != 1 || got.IsActive != true {
		t.Fatalf("saved credential = %#v, want credential rotation fields to match", got)
	}
}

func TestRotateCredentialRejectsInvalidInput(t *testing.T) {
	t.Parallel()

	svc := NewCredentialService(&stubCredentialStore{}, "tenant-default")

	_, err := svc.Rotate(context.Background(), RotateCredentialInput{})
	if err == nil {
		t.Fatal("Rotate() error = nil, want invalid input error")
	}
	if got, want := err.Error(), "INTEGRATIONS_CREDENTIAL_INVALID"; got != want {
		t.Fatalf("Rotate() error = %q, want %q", got, want)
	}
}

func TestUpsertAuthSession(t *testing.T) {
	t.Parallel()

	now := time.Unix(123, 0).UTC()
	store := &stubAuthSessionStore{}
	svc := NewAuthService(store, "tenant-default")

	session, err := svc.Upsert(context.Background(), UpsertAuthSessionInput{
		AuthSessionID:      "auth_001",
		InstallationID:     "inst_001",
		ProviderAccountID:  "acct_001",
		AccessTokenExpiresAt: &now,
	})
	if err != nil {
		t.Fatalf("Upsert() error = %v", err)
	}

	if session.TenantID != "tenant-default" {
		t.Fatalf("tenant_id = %q, want %q", session.TenantID, "tenant-default")
	}
	if session.State != domain.AuthStateValid {
		t.Fatalf("state = %q, want %q", session.State, domain.AuthStateValid)
	}
	if session.ConsecutiveFailures != 0 {
		t.Fatalf("consecutive_failures = %d, want 0", session.ConsecutiveFailures)
	}
	if session.RefreshFailureCode != "" {
		t.Fatalf("refresh_failure_code = %q, want empty", session.RefreshFailureCode)
	}
	if session.CreatedAt.IsZero() || session.UpdatedAt.IsZero() {
		t.Fatalf("timestamps must be set: created_at=%v updated_at=%v", session.CreatedAt, session.UpdatedAt)
	}
	if session.AccessTokenExpiresAt == nil || !session.AccessTokenExpiresAt.Equal(now) {
		t.Fatalf("access_token_expires_at = %v, want %v", session.AccessTokenExpiresAt, now)
	}
	if len(store.saved) != 1 {
		t.Fatalf("saved sessions = %d, want 1", len(store.saved))
	}
	if got, want := store.saved[0], session; !reflect.DeepEqual(got, want) {
		t.Fatalf("saved session = %#v, want %#v", got, want)
	}
}

func TestUpsertAuthSessionRejectsInvalidInput(t *testing.T) {
	t.Parallel()

	svc := NewAuthService(&stubAuthSessionStore{}, "tenant-default")

	_, err := svc.Upsert(context.Background(), UpsertAuthSessionInput{})
	if err == nil {
		t.Fatal("Upsert() error = nil, want invalid input error")
	}
	if got, want := err.Error(), "INTEGRATIONS_AUTH_INVALID"; got != want {
		t.Fatalf("Upsert() error = %q, want %q", got, want)
	}
}

func TestRecordOperation(t *testing.T) {
	t.Parallel()

	store := &stubOperationRunStore{}
	svc := NewOperationService(store, "tenant-default")

	run, err := svc.Record(context.Background(), RecordOperationInput{
		OperationRunID: "run_001",
		InstallationID: "inst_001",
		OperationType:  "installation_verify",
		Status:         domain.OperationRunStatusQueued,
		ResultCode:     "queued",
		AttemptCount:   0,
	})
	if err != nil {
		t.Fatalf("Record() error = %v", err)
	}

	if run.TenantID != "tenant-default" {
		t.Fatalf("tenant_id = %q, want %q", run.TenantID, "tenant-default")
	}
	if run.AttemptCount != 0 {
		t.Fatalf("attempt_count = %d, want 0", run.AttemptCount)
	}
	if run.CreatedAt.IsZero() || run.UpdatedAt.IsZero() {
		t.Fatalf("timestamps must be set: created_at=%v updated_at=%v", run.CreatedAt, run.UpdatedAt)
	}
	if len(store.saved) != 1 {
		t.Fatalf("saved operation runs = %d, want 1", len(store.saved))
	}
	if got, want := store.saved[0], run; !reflect.DeepEqual(got, want) {
		t.Fatalf("saved run = %#v, want %#v", got, want)
	}
}

func TestRecordOperationRejectsInvalidInput(t *testing.T) {
	t.Parallel()

	svc := NewOperationService(&stubOperationRunStore{}, "tenant-default")

	_, err := svc.Record(context.Background(), RecordOperationInput{
		OperationRunID: "run_001",
		InstallationID: "inst_001",
		OperationType:  "installation_verify",
		Status:         domain.OperationRunStatusQueued,
		AttemptCount:   -1,
	})
	if err == nil {
		t.Fatal("Record() error = nil, want invalid input error")
	}
	if got, want := err.Error(), "INTEGRATIONS_OPERATION_INVALID"; got != want {
		t.Fatalf("Record() error = %q, want %q", got, want)
	}
}
