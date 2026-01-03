-- Migration 020: Users and API Keys Tables
-- Creates tables for multi-tenancy support

-- Users table (synced from Stack Auth)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  stack_auth_id VARCHAR(255) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255),
  avatar_url TEXT,
  email_verified BOOLEAN DEFAULT false,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- API Keys table for external agent authentication
CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key_hash VARCHAR(64) NOT NULL UNIQUE,
  key_prefix VARCHAR(12) NOT NULL,  -- aipp_xxxxxx for display
  name VARCHAR(100) NOT NULL,
  scopes JSONB DEFAULT '["read", "write"]',
  last_used_at TIMESTAMP,
  expires_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_stack_auth_id ON users(stack_auth_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys(user_id) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys(key_hash) WHERE revoked_at IS NULL;
