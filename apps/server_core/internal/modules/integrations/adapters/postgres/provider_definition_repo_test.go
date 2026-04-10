package postgres

import (
	"context"
	"errors"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"marketplace-central/apps/server_core/internal/modules/integrations/domain"
)

type fakeProviderDefinitionDB struct {
	queryRowSQL  string
	queryRowArgs []any
	row          pgx.Row
}

func (f *fakeProviderDefinitionDB) Exec(context.Context, string, ...any) (pgconn.CommandTag, error) {
	return pgconn.CommandTag{}, nil
}

func (f *fakeProviderDefinitionDB) Query(context.Context, string, ...any) (pgx.Rows, error) {
	return nil, nil
}

func (f *fakeProviderDefinitionDB) QueryRow(_ context.Context, sql string, args ...any) pgx.Row {
	f.queryRowSQL = sql
	f.queryRowArgs = append([]any(nil), args...)
	return f.row
}

type fakeProviderDefinitionRow struct {
	values []any
	err    error
}

func (r fakeProviderDefinitionRow) Scan(dest ...any) error {
	if r.err != nil {
		return r.err
	}
	if len(dest) != len(r.values) {
		return errors.New("unexpected destination count")
	}

	for i := range dest {
		if err := assignScanValue(dest[i], r.values[i]); err != nil {
			return err
		}
	}

	return nil
}

func assignScanValue(dest any, value any) error {
	dv := reflect.ValueOf(dest)
	if dv.Kind() != reflect.Pointer || dv.IsNil() {
		return errors.New("destination must be a non-nil pointer")
	}

	ev := dv.Elem()
	vv := reflect.ValueOf(value)
	if !vv.IsValid() {
		ev.Set(reflect.Zero(ev.Type()))
		return nil
	}
	if vv.Type().AssignableTo(ev.Type()) {
		ev.Set(vv)
		return nil
	}
	if vv.Type().ConvertibleTo(ev.Type()) {
		ev.Set(vv.Convert(ev.Type()))
		return nil
	}

	return errors.New("unsupported assignment")
}

func TestGetProviderDefinitionReturnsRequestedProvider(t *testing.T) {
	t.Parallel()

	now := time.Date(2026, 4, 10, 12, 0, 0, 0, time.UTC)
	db := &fakeProviderDefinitionDB{
		row: fakeProviderDefinitionRow{
			values: []any{
				"mercado_livre",
				"system",
				domain.IntegrationFamilyMarketplace,
				"Mercado Livre",
				domain.AuthStrategyOAuth2,
				domain.InstallModeInteractive,
				[]byte(`{"region":"br"}`),
				[]byte(`["messages","orders"]`),
				true,
				now,
				now,
			},
		},
	}
	repo := &ProviderDefinitionRepository{db: db}

	got, found, err := repo.GetProviderDefinition(context.Background(), "mercado_livre")
	if err != nil {
		t.Fatalf("GetProviderDefinition returned error: %v", err)
	}
	if !found {
		t.Fatal("GetProviderDefinition returned found=false")
	}
	if got.ProviderCode != "mercado_livre" || got.TenantID != "system" {
		t.Fatalf("unexpected provider definition: %#v", got)
	}
	if got.DisplayName != "Mercado Livre" {
		t.Fatalf("unexpected display name: got %q", got.DisplayName)
	}
	if got.AuthStrategy != domain.AuthStrategyOAuth2 {
		t.Fatalf("unexpected auth strategy: got %q", got.AuthStrategy)
	}
	if got.InstallMode != domain.InstallModeInteractive {
		t.Fatalf("unexpected install mode: got %q", got.InstallMode)
	}
	if !reflect.DeepEqual(got.Metadata, map[string]any{"region": "br"}) {
		t.Fatalf("unexpected metadata: %#v", got.Metadata)
	}
	if !reflect.DeepEqual(got.DeclaredCapabilities, []string{"messages", "orders"}) {
		t.Fatalf("unexpected capabilities: %#v", got.DeclaredCapabilities)
	}
	if got.IsActive != true {
		t.Fatalf("unexpected active flag: got %v", got.IsActive)
	}
	if got.CreatedAt != now || got.UpdatedAt != now {
		t.Fatalf("unexpected timestamps: got %v %v", got.CreatedAt, got.UpdatedAt)
	}
	if !strings.Contains(db.queryRowSQL, "WHERE tenant_id = 'system'") {
		t.Fatalf("query missing system tenant scope: %s", db.queryRowSQL)
	}
	if len(db.queryRowArgs) != 1 || db.queryRowArgs[0] != "mercado_livre" {
		t.Fatalf("unexpected query args: %#v", db.queryRowArgs)
	}
}

func TestGetProviderDefinitionReturnsNotFoundForMissingRow(t *testing.T) {
	t.Parallel()

	db := &fakeProviderDefinitionDB{
		row: fakeProviderDefinitionRow{err: pgx.ErrNoRows},
	}
	repo := &ProviderDefinitionRepository{db: db}

	got, found, err := repo.GetProviderDefinition(context.Background(), "unknown")
	if err != nil {
		t.Fatalf("GetProviderDefinition returned error: %v", err)
	}
	if found {
		t.Fatal("GetProviderDefinition returned found=true")
	}
	if got.ProviderCode != "" || got.TenantID != "" || got.DisplayName != "" || got.IsActive {
		t.Fatalf("unexpected provider definition: %#v", got)
	}
}

func TestGetProviderDefinitionReturnsErrorForMalformedJSON(t *testing.T) {
	t.Parallel()

	db := &fakeProviderDefinitionDB{
		row: fakeProviderDefinitionRow{
			values: []any{
				"mercado_livre",
				"system",
				domain.IntegrationFamilyMarketplace,
				"Mercado Livre",
				domain.AuthStrategyOAuth2,
				domain.InstallModeInteractive,
				[]byte(`{"region":`),
				[]byte(`["messages"`),
				true,
				time.Date(2026, 4, 10, 12, 0, 0, 0, time.UTC),
				time.Date(2026, 4, 10, 12, 0, 0, 0, time.UTC),
			},
		},
	}
	repo := &ProviderDefinitionRepository{db: db}

	_, found, err := repo.GetProviderDefinition(context.Background(), "mercado_livre")
	if err == nil {
		t.Fatal("GetProviderDefinition returned nil error")
	}
	if found {
		t.Fatal("GetProviderDefinition returned found=true")
	}
}

func TestGetProviderDefinitionReturnsScanError(t *testing.T) {
	t.Parallel()

	db := &fakeProviderDefinitionDB{
		row: fakeProviderDefinitionRow{err: errors.New("scan failed")},
	}
	repo := &ProviderDefinitionRepository{db: db}

	_, found, err := repo.GetProviderDefinition(context.Background(), "mercado_livre")
	if err == nil {
		t.Fatal("GetProviderDefinition returned nil error")
	}
	if found {
		t.Fatal("GetProviderDefinition returned found=true")
	}
	if got, want := err.Error(), "scan failed"; got != want {
		t.Fatalf("unexpected error: got %q want %q", got, want)
	}
}
