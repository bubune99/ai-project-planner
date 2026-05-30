-- Migration 050: OAuth 2.1 Authorization Server (for MCP custom connectors)
--
-- Enables Claude Desktop's "Add custom connector" flow (and any OAuth 2.1 +
-- PKCE + dynamic-client-registration MCP client) to authenticate against the
-- planner WITHOUT the user hand-pasting an aipp_ API key.
--
-- Design: OAuth is a thin auto-provisioning front-end over the EXISTING
-- api_keys table. The /token endpoint mints a normal scoped aipp_ key for the
-- signed-in user and returns it as the OAuth access_token. The /mcp endpoint's
-- existing Bearer-aipp_ validation path is unchanged — it never learns OAuth
-- happened. Revoking the api_keys row revokes the connector.
--
-- See memory: idea-h-catalog-first (sibling infra), planner-prod-url-correction.

-- ---------------------------------------------------------------------------
-- Registered OAuth clients (one row per dynamic registration / per MCP client)
-- RFC 7591 dynamic client registration writes here.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS oauth_clients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id VARCHAR(64) NOT NULL UNIQUE,        -- public identifier we issue
  client_secret_hash VARCHAR(64),               -- NULL for public (PKCE) clients
  client_name VARCHAR(255),                     -- e.g. "Claude" / "Claude Desktop"
  redirect_uris JSONB NOT NULL DEFAULT '[]',    -- allow-list of exact redirect URIs
  grant_types JSONB NOT NULL DEFAULT '["authorization_code","refresh_token"]',
  token_endpoint_auth_method VARCHAR(32) NOT NULL DEFAULT 'none', -- 'none' = public+PKCE
  scope TEXT,                                    -- space-delimited requested scope
  metadata JSONB DEFAULT '{}',                  -- raw registration payload for audit
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oauth_clients_client_id ON oauth_clients(client_id);

-- ---------------------------------------------------------------------------
-- Authorization codes (short-lived, single-use, PKCE-bound)
-- Written by /oauth/authorize on consent-approve, consumed by /api/oauth/token.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS oauth_auth_codes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code_hash VARCHAR(64) NOT NULL UNIQUE,        -- sha256 of the issued code (never store raw)
  client_id VARCHAR(64) NOT NULL REFERENCES oauth_clients(client_id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  redirect_uri TEXT NOT NULL,                   -- must match at token exchange
  scope TEXT,                                    -- space-delimited granted scope
  resource TEXT,                                 -- RFC 8707 resource indicator (audience), if sent
  code_challenge VARCHAR(128) NOT NULL,         -- PKCE challenge
  code_challenge_method VARCHAR(10) NOT NULL DEFAULT 'S256',
  expires_at TIMESTAMP NOT NULL,                -- short TTL (e.g. now()+10min)
  consumed_at TIMESTAMP,                         -- set on first successful exchange (single-use)
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_oauth_auth_codes_code_hash ON oauth_auth_codes(code_hash);
CREATE INDEX IF NOT EXISTS idx_oauth_auth_codes_expiry ON oauth_auth_codes(expires_at) WHERE consumed_at IS NULL;

-- ---------------------------------------------------------------------------
-- Link the api_keys row we mint back to the OAuth grant that created it, so a
-- connector can be audited / revoked as a unit. Nullable: hand-made keys have
-- no OAuth origin.
-- ---------------------------------------------------------------------------
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS oauth_client_id VARCHAR(64);
