CREATE TABLE IF NOT EXISTS integration_oauth_states (
  tenant_id        text        NOT NULL,
  oauth_state_id    text        NOT NULL,
  installation_id   text        NOT NULL,
  nonce             text        NOT NULL,
  code_verifier     text        NOT NULL,
  hmac_signature    text        NOT NULL,
  expires_at        timestamptz NOT NULL,
  consumed_at       timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, oauth_state_id),
  CONSTRAINT uq_integration_oauth_states_tenant_nonce
    UNIQUE (tenant_id, nonce),
  CONSTRAINT fk_integration_oauth_states_installation
    FOREIGN KEY (tenant_id, installation_id)
    REFERENCES integration_installations (tenant_id, installation_id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_integration_oauth_states_tenant_nonce
  ON integration_oauth_states (tenant_id, nonce);

CREATE INDEX IF NOT EXISTS idx_integration_oauth_states_expires_at
  ON integration_oauth_states (tenant_id, expires_at);

ALTER TABLE integration_auth_sessions
  ADD COLUMN IF NOT EXISTS next_retry_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS uq_integration_installations_active_provider_account
  ON integration_installations (tenant_id, provider_code, external_account_id)
  WHERE status NOT IN ('disconnected', 'failed')
    AND external_account_id <> '';
