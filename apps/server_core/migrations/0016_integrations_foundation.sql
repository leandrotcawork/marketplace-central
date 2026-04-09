CREATE TABLE IF NOT EXISTS integration_provider_definitions (
  tenant_id             text    NOT NULL DEFAULT 'system',
  provider_code         text    NOT NULL,
  family                text    NOT NULL CHECK (family IN ('marketplace')),
  display_name          text    NOT NULL,
  auth_strategy         text    NOT NULL CHECK (auth_strategy IN ('oauth2', 'api_key', 'token', 'none', 'unknown')),
  install_mode          text    NOT NULL CHECK (install_mode IN ('interactive', 'manual', 'hybrid')),
  metadata_json         jsonb   NOT NULL DEFAULT '{}'::jsonb,
  declared_caps_json    jsonb   NOT NULL DEFAULT '[]'::jsonb,
  is_active             boolean NOT NULL DEFAULT true,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider_code),
  CONSTRAINT ck_integration_provider_definitions_system_owned
    CHECK (tenant_id = 'system')
);

CREATE INDEX IF NOT EXISTS idx_integration_provider_definitions_catalog
  ON integration_provider_definitions (tenant_id, family, is_active, provider_code);

ALTER TABLE integration_provider_definitions
  ADD CONSTRAINT uq_integration_provider_definitions_provider_family
    UNIQUE (provider_code, family);

CREATE TABLE IF NOT EXISTS integration_installations (
  installation_id           text    NOT NULL,
  tenant_id                 text    NOT NULL,
  provider_code             text    NOT NULL,
  family                    text    NOT NULL CHECK (family IN ('marketplace')),
  display_name              text    NOT NULL,
  status                    text    NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending_connection', 'connected', 'degraded', 'requires_reauth', 'disconnected', 'suspended', 'failed')),
  health_status             text    NOT NULL DEFAULT 'healthy' CHECK (health_status IN ('healthy', 'warning', 'critical')),
  external_account_id       text    NOT NULL DEFAULT '',
  external_account_name     text    NOT NULL DEFAULT '',
  active_credential_id      text,
  last_verified_at          timestamptz,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (installation_id),
  CONSTRAINT uq_integration_installations_tenant_installation
    UNIQUE (tenant_id, installation_id),
  CONSTRAINT fk_integration_installations_provider
    FOREIGN KEY (provider_code, family)
    REFERENCES integration_provider_definitions (provider_code, family)
);

CREATE INDEX IF NOT EXISTS idx_integration_installations_provider
  ON integration_installations (tenant_id, provider_code);

CREATE INDEX IF NOT EXISTS idx_integration_installations_status
  ON integration_installations (tenant_id, status);

CREATE TABLE IF NOT EXISTS integration_credentials (
  tenant_id                 text    NOT NULL,
  credential_id             text    NOT NULL,
  installation_id           text    NOT NULL,
  version                   integer NOT NULL,
  secret_type               text    NOT NULL,
  encrypted_payload         bytea   NOT NULL,
  encryption_key_id         text    NOT NULL,
  is_active                 boolean NOT NULL DEFAULT true,
  revoked_at                timestamptz,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, credential_id),
  CONSTRAINT ck_integration_credentials_version_positive
    CHECK (version > 0),
  CONSTRAINT ck_integration_credentials_active_not_revoked
    CHECK (NOT is_active OR revoked_at IS NULL),
  CONSTRAINT fk_integration_credentials_installation
    FOREIGN KEY (tenant_id, installation_id)
    REFERENCES integration_installations (tenant_id, installation_id)
    ON DELETE CASCADE
);

ALTER TABLE integration_credentials
  ADD CONSTRAINT uq_integration_credentials_installation_credential
    UNIQUE (tenant_id, installation_id, credential_id);

ALTER TABLE integration_installations
  ADD CONSTRAINT fk_integration_installations_active_credential
    FOREIGN KEY (tenant_id, installation_id, active_credential_id)
    REFERENCES integration_credentials (tenant_id, installation_id, credential_id)
    DEFERRABLE INITIALLY DEFERRED;

CREATE OR REPLACE FUNCTION enforce_installation_active_credential_is_usable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.active_credential_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM integration_credentials c
    WHERE c.tenant_id = NEW.tenant_id
      AND c.installation_id = NEW.installation_id
      AND c.credential_id = NEW.active_credential_id
      AND c.is_active = true
      AND c.revoked_at IS NULL
  ) THEN
    RAISE EXCEPTION 'INTEGRATIONS_ACTIVE_CREDENTIAL_NOT_USABLE';
  END IF;

  RETURN NEW;
END;
$$;

CREATE CONSTRAINT TRIGGER trg_enforce_installation_active_credential_is_usable
  AFTER INSERT OR UPDATE OF tenant_id, installation_id, active_credential_id
  ON integration_installations
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION enforce_installation_active_credential_is_usable();

CREATE OR REPLACE FUNCTION prevent_deactivating_or_revoking_referenced_credential()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF (NEW.is_active = false OR NEW.revoked_at IS NOT NULL)
     AND EXISTS (
       SELECT 1
       FROM integration_installations i
       WHERE i.tenant_id = NEW.tenant_id
         AND i.installation_id = NEW.installation_id
         AND i.active_credential_id = NEW.credential_id
     ) THEN
    RAISE EXCEPTION 'INTEGRATIONS_ACTIVE_CREDENTIAL_STATE_CONFLICT';
  END IF;

  RETURN NEW;
END;
$$;

CREATE CONSTRAINT TRIGGER trg_prevent_deactivating_or_revoking_referenced_credential
  AFTER UPDATE OF is_active, revoked_at
  ON integration_credentials
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION prevent_deactivating_or_revoking_referenced_credential();

CREATE UNIQUE INDEX IF NOT EXISTS idx_integration_credentials_version
  ON integration_credentials (tenant_id, installation_id, version);

CREATE UNIQUE INDEX IF NOT EXISTS idx_integration_credentials_active
  ON integration_credentials (tenant_id, installation_id)
  WHERE is_active;

CREATE TABLE IF NOT EXISTS integration_auth_sessions (
  tenant_id                 text    NOT NULL,
  auth_session_id           text    NOT NULL,
  installation_id           text    NOT NULL,
  state                     text    NOT NULL CHECK (state IN ('valid', 'expiring', 'invalid', 'refresh_failed')),
  provider_account_id       text    NOT NULL DEFAULT '',
  access_token_expires_at   timestamptz,
  last_verified_at          timestamptz,
  refresh_failure_code      text    NOT NULL DEFAULT '',
  consecutive_failures      integer NOT NULL DEFAULT 0,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, auth_session_id),
  CONSTRAINT ck_integration_auth_sessions_consecutive_failures_nonnegative
    CHECK (consecutive_failures >= 0),
  CONSTRAINT fk_integration_auth_sessions_installation
    FOREIGN KEY (tenant_id, installation_id)
    REFERENCES integration_installations (tenant_id, installation_id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_integration_auth_sessions_installation
  ON integration_auth_sessions (tenant_id, installation_id, state);

CREATE TABLE IF NOT EXISTS integration_capability_states (
  tenant_id                 text    NOT NULL,
  capability_state_id       text    NOT NULL,
  installation_id           text    NOT NULL,
  capability_code           text    NOT NULL,
  status                    text    NOT NULL CHECK (status IN ('enabled', 'degraded', 'disabled', 'requires_reauth', 'unsupported')),
  reason_code               text    NOT NULL DEFAULT '',
  last_evaluated_at         timestamptz,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, capability_state_id),
  CONSTRAINT fk_integration_capability_states_installation
    FOREIGN KEY (tenant_id, installation_id)
    REFERENCES integration_installations (tenant_id, installation_id)
    ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_integration_capability_states_unique
  ON integration_capability_states (tenant_id, installation_id, capability_code);

CREATE TABLE IF NOT EXISTS integration_operation_runs (
  tenant_id                 text    NOT NULL,
  operation_run_id          text    NOT NULL,
  installation_id           text    NOT NULL,
  operation_type            text    NOT NULL,
  status                    text    NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  result_code               text    NOT NULL DEFAULT '',
  failure_code              text    NOT NULL DEFAULT '',
  attempt_count             integer NOT NULL DEFAULT 0,
  actor_type                text    NOT NULL DEFAULT '',
  actor_id                  text    NOT NULL DEFAULT '',
  started_at                timestamptz,
  completed_at              timestamptz,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, operation_run_id),
  CONSTRAINT ck_integration_operation_runs_attempt_count_nonnegative
    CHECK (attempt_count >= 0),
  CONSTRAINT fk_integration_operation_runs_installation
    FOREIGN KEY (tenant_id, installation_id)
    REFERENCES integration_installations (tenant_id, installation_id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_integration_operation_runs_installation
  ON integration_operation_runs (tenant_id, installation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_integration_operation_runs_status
  ON integration_operation_runs (tenant_id, status, created_at DESC);

ALTER TABLE marketplace_accounts
  ADD COLUMN IF NOT EXISTS integration_installation_id text,
  ADD CONSTRAINT fk_marketplace_accounts_integration_installation
    FOREIGN KEY (tenant_id, integration_installation_id)
    REFERENCES integration_installations (tenant_id, installation_id)
    ON DELETE SET NULL (integration_installation_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_marketplace_accounts_integration_installation
  ON marketplace_accounts (tenant_id, integration_installation_id)
  WHERE integration_installation_id IS NOT NULL;
