-- ============================================================================
-- Migration 028: Finance Module (JARVIS)
-- Part of the JARVIS Personal Assistant Platform
-- Agent: JARVIS-Finance (Agent 2)
-- ============================================================================

-- Account type enum
DO $$ BEGIN
  CREATE TYPE account_type AS ENUM ('checking', 'savings', 'credit_card', 'investment', 'cash', 'loan', 'other');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Transaction type enum
DO $$ BEGIN
  CREATE TYPE transaction_type AS ENUM ('income', 'expense', 'transfer');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Budget period enum
DO $$ BEGIN
  CREATE TYPE budget_period AS ENUM ('weekly', 'monthly', 'quarterly', 'yearly');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Income source type enum
DO $$ BEGIN
  CREATE TYPE income_source_type AS ENUM ('salary', 'freelance', 'investment', 'rental', 'business', 'gift', 'other');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Recurring frequency enum
DO $$ BEGIN
  CREATE TYPE recurring_frequency AS ENUM ('daily', 'weekly', 'biweekly', 'monthly', 'quarterly', 'yearly');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- Financial Accounts Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS finance_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Basic info
  name VARCHAR(100) NOT NULL,
  account_type account_type NOT NULL,
  institution VARCHAR(100),
  account_number_last4 VARCHAR(4), -- Last 4 digits for identification

  -- Currency and balance
  currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  current_balance DECIMAL(15,2) NOT NULL DEFAULT 0,
  available_balance DECIMAL(15,2), -- For credit cards: available credit

  -- Credit card specific
  credit_limit DECIMAL(15,2),
  interest_rate DECIMAL(5,2), -- APR percentage

  -- Loan specific
  loan_principal DECIMAL(15,2),
  loan_term_months INTEGER,

  -- Status
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_primary BOOLEAN NOT NULL DEFAULT false, -- Primary account for the user

  -- Display
  color VARCHAR(7), -- Hex color for UI
  icon VARCHAR(50),

  -- Metadata
  metadata JSONB DEFAULT '{}',

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- ============================================================================
-- Transaction Categories Table (User customizable)
-- ============================================================================
CREATE TABLE IF NOT EXISTS finance_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE, -- NULL for system categories

  name VARCHAR(100) NOT NULL,
  parent_id UUID REFERENCES finance_categories(id) ON DELETE CASCADE, -- For subcategories

  -- Type: determines if this category is for income or expenses
  is_income BOOLEAN NOT NULL DEFAULT false,

  -- Visual
  icon VARCHAR(50),
  color VARCHAR(7), -- Hex color

  -- System category flag (cannot be deleted by user)
  is_system BOOLEAN NOT NULL DEFAULT false,

  -- Ordering
  order_index INTEGER NOT NULL DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Ensure unique category names per user (or globally for system categories)
  UNIQUE NULLS NOT DISTINCT (user_id, name, parent_id)
);

-- ============================================================================
-- Transactions Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS finance_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES finance_accounts(id) ON DELETE CASCADE,

  -- Transaction details
  transaction_type transaction_type NOT NULL,
  amount DECIMAL(15,2) NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'USD',

  -- Categorization
  category_id UUID REFERENCES finance_categories(id) ON DELETE SET NULL,

  -- Description
  description TEXT,
  merchant VARCHAR(255),
  notes TEXT,

  -- Date/Time
  transaction_date DATE NOT NULL,
  posted_date DATE, -- When it cleared/posted

  -- Transfer support
  transfer_to_account_id UUID REFERENCES finance_accounts(id) ON DELETE SET NULL,
  transfer_pair_id UUID, -- Links two transactions that are a transfer pair

  -- Recurring transaction link
  recurring_id UUID, -- Will reference finance_recurring_transactions
  is_recurring BOOLEAN NOT NULL DEFAULT false,

  -- Tags for flexible categorization
  tags TEXT[] DEFAULT '{}',

  -- External references
  external_id VARCHAR(255), -- For bank sync integration

  -- Location (optional)
  location_name VARCHAR(255),
  location_lat DECIMAL(10,8),
  location_lng DECIMAL(11,8),

  -- Receipt/attachment
  receipt_blob_key VARCHAR(500),

  -- Status
  is_pending BOOLEAN NOT NULL DEFAULT false,
  is_reconciled BOOLEAN NOT NULL DEFAULT false,

  -- Metadata
  metadata JSONB DEFAULT '{}',

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- Budgets Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS finance_budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  name VARCHAR(100) NOT NULL,

  -- What this budget tracks
  category_id UUID REFERENCES finance_categories(id) ON DELETE CASCADE,
  -- If category_id is NULL, this is a total spending budget

  -- Budget amount and period
  amount DECIMAL(15,2) NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  period budget_period NOT NULL DEFAULT 'monthly',

  -- Date range (optional, for one-time budgets)
  start_date DATE,
  end_date DATE,

  -- Alerts
  alert_threshold INTEGER DEFAULT 80, -- Percentage at which to alert
  alert_enabled BOOLEAN NOT NULL DEFAULT true,

  -- Rollover (carry unused amount to next period)
  rollover_enabled BOOLEAN NOT NULL DEFAULT false,
  rollover_amount DECIMAL(15,2) DEFAULT 0,

  -- Status
  is_active BOOLEAN NOT NULL DEFAULT true,

  -- Visual
  color VARCHAR(7),
  icon VARCHAR(50),

  -- Metadata
  metadata JSONB DEFAULT '{}',

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- ============================================================================
-- Income Streams Table (Recurring income sources)
-- ============================================================================
CREATE TABLE IF NOT EXISTS finance_income_streams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  name VARCHAR(100) NOT NULL,
  source_type income_source_type NOT NULL,

  -- Amount and frequency
  amount DECIMAL(15,2) NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  frequency recurring_frequency NOT NULL DEFAULT 'monthly',

  -- Payment details
  next_payment_date DATE,
  account_id UUID REFERENCES finance_accounts(id) ON DELETE SET NULL, -- Where income is deposited

  -- Employer/Source info
  source_name VARCHAR(255), -- Company name, client name, etc.

  -- Tax info
  is_taxable BOOLEAN NOT NULL DEFAULT true,
  tax_category VARCHAR(50), -- W2, 1099, etc.

  -- Status
  is_active BOOLEAN NOT NULL DEFAULT true,

  -- Metadata (for custom fields)
  metadata JSONB DEFAULT '{}',

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- ============================================================================
-- Recurring Transactions Table (Templates for recurring transactions)
-- ============================================================================
CREATE TABLE IF NOT EXISTS finance_recurring_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES finance_accounts(id) ON DELETE CASCADE,

  -- Transaction template
  transaction_type transaction_type NOT NULL,
  amount DECIMAL(15,2) NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  category_id UUID REFERENCES finance_categories(id) ON DELETE SET NULL,
  description TEXT,
  merchant VARCHAR(255),

  -- Schedule
  frequency recurring_frequency NOT NULL,
  next_occurrence DATE NOT NULL,
  end_date DATE, -- NULL means indefinite

  -- Auto-create settings
  auto_create BOOLEAN NOT NULL DEFAULT false, -- Automatically create transaction
  days_before_reminder INTEGER DEFAULT 3, -- Days before to send reminder

  -- Status
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_created_at TIMESTAMPTZ, -- When the last transaction was created from this template

  -- Metadata
  metadata JSONB DEFAULT '{}',

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- Financial Goals Table (Savings goals, debt payoff, etc.)
-- ============================================================================
CREATE TABLE IF NOT EXISTS finance_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  name VARCHAR(100) NOT NULL,
  description TEXT,

  -- Goal type: 'savings', 'debt_payoff', 'investment', 'emergency_fund'
  goal_type VARCHAR(50) NOT NULL,

  -- Target
  target_amount DECIMAL(15,2) NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  current_amount DECIMAL(15,2) NOT NULL DEFAULT 0,

  -- Timeline
  target_date DATE,
  started_at DATE NOT NULL DEFAULT CURRENT_DATE,

  -- Linked account (optional - where savings are held)
  account_id UUID REFERENCES finance_accounts(id) ON DELETE SET NULL,

  -- Auto-contribute settings
  auto_contribute BOOLEAN NOT NULL DEFAULT false,
  contribute_amount DECIMAL(15,2),
  contribute_frequency recurring_frequency,

  -- Priority (for multiple goals)
  priority INTEGER NOT NULL DEFAULT 0,

  -- Status
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_completed BOOLEAN NOT NULL DEFAULT false,
  completed_at TIMESTAMPTZ,

  -- Visual
  color VARCHAR(7),
  icon VARCHAR(50),
  image_blob_key VARCHAR(500),

  -- Metadata
  metadata JSONB DEFAULT '{}',

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- ============================================================================
-- Insert System Categories
-- ============================================================================
INSERT INTO finance_categories (id, user_id, name, is_income, icon, color, is_system, order_index) VALUES
  -- Income categories
  (gen_random_uuid(), NULL, 'Salary', true, 'briefcase', '#22c55e', true, 1),
  (gen_random_uuid(), NULL, 'Freelance', true, 'laptop', '#10b981', true, 2),
  (gen_random_uuid(), NULL, 'Investments', true, 'trending-up', '#14b8a6', true, 3),
  (gen_random_uuid(), NULL, 'Gifts', true, 'gift', '#06b6d4', true, 4),
  (gen_random_uuid(), NULL, 'Other Income', true, 'plus-circle', '#0ea5e9', true, 5),
  -- Expense categories
  (gen_random_uuid(), NULL, 'Housing', false, 'home', '#ef4444', true, 10),
  (gen_random_uuid(), NULL, 'Transportation', false, 'car', '#f97316', true, 11),
  (gen_random_uuid(), NULL, 'Food & Dining', false, 'utensils', '#f59e0b', true, 12),
  (gen_random_uuid(), NULL, 'Shopping', false, 'shopping-bag', '#eab308', true, 13),
  (gen_random_uuid(), NULL, 'Entertainment', false, 'film', '#84cc16', true, 14),
  (gen_random_uuid(), NULL, 'Healthcare', false, 'heart-pulse', '#22c55e', true, 15),
  (gen_random_uuid(), NULL, 'Personal Care', false, 'sparkles', '#10b981', true, 16),
  (gen_random_uuid(), NULL, 'Education', false, 'graduation-cap', '#14b8a6', true, 17),
  (gen_random_uuid(), NULL, 'Bills & Utilities', false, 'file-text', '#06b6d4', true, 18),
  (gen_random_uuid(), NULL, 'Insurance', false, 'shield', '#0ea5e9', true, 19),
  (gen_random_uuid(), NULL, 'Subscriptions', false, 'repeat', '#3b82f6', true, 20),
  (gen_random_uuid(), NULL, 'Travel', false, 'plane', '#6366f1', true, 21),
  (gen_random_uuid(), NULL, 'Fees & Charges', false, 'alert-circle', '#8b5cf6', true, 22),
  (gen_random_uuid(), NULL, 'Taxes', false, 'landmark', '#a855f7', true, 23),
  (gen_random_uuid(), NULL, 'Other Expenses', false, 'more-horizontal', '#d946ef', true, 24)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- Indexes
-- ============================================================================

-- Accounts
CREATE INDEX IF NOT EXISTS idx_finance_accounts_user ON finance_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_finance_accounts_active ON finance_accounts(user_id, is_active) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_finance_accounts_type ON finance_accounts(account_type);

-- Categories
CREATE INDEX IF NOT EXISTS idx_finance_categories_user ON finance_categories(user_id);
CREATE INDEX IF NOT EXISTS idx_finance_categories_parent ON finance_categories(parent_id);
CREATE INDEX IF NOT EXISTS idx_finance_categories_system ON finance_categories(is_system);

-- Transactions
CREATE INDEX IF NOT EXISTS idx_finance_transactions_user ON finance_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_finance_transactions_account ON finance_transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_finance_transactions_date ON finance_transactions(user_id, transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_finance_transactions_category ON finance_transactions(category_id);
CREATE INDEX IF NOT EXISTS idx_finance_transactions_type ON finance_transactions(transaction_type);
CREATE INDEX IF NOT EXISTS idx_finance_transactions_recurring ON finance_transactions(recurring_id) WHERE recurring_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_finance_transactions_pending ON finance_transactions(user_id, is_pending) WHERE is_pending = true;
CREATE INDEX IF NOT EXISTS idx_finance_transactions_merchant ON finance_transactions(merchant);

-- Budgets
CREATE INDEX IF NOT EXISTS idx_finance_budgets_user ON finance_budgets(user_id);
CREATE INDEX IF NOT EXISTS idx_finance_budgets_category ON finance_budgets(category_id);
CREATE INDEX IF NOT EXISTS idx_finance_budgets_active ON finance_budgets(user_id, is_active) WHERE deleted_at IS NULL;

-- Income Streams
CREATE INDEX IF NOT EXISTS idx_finance_income_streams_user ON finance_income_streams(user_id);
CREATE INDEX IF NOT EXISTS idx_finance_income_streams_active ON finance_income_streams(user_id, is_active) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_finance_income_streams_next ON finance_income_streams(next_payment_date) WHERE is_active = true;

-- Recurring Transactions
CREATE INDEX IF NOT EXISTS idx_finance_recurring_user ON finance_recurring_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_finance_recurring_next ON finance_recurring_transactions(next_occurrence) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_finance_recurring_account ON finance_recurring_transactions(account_id);

-- Goals
CREATE INDEX IF NOT EXISTS idx_finance_goals_user ON finance_goals(user_id);
CREATE INDEX IF NOT EXISTS idx_finance_goals_active ON finance_goals(user_id, is_active) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_finance_goals_type ON finance_goals(goal_type);

-- ============================================================================
-- Triggers for updated_at
-- ============================================================================

-- Use existing update_updated_at_column function from migration 026

DROP TRIGGER IF EXISTS update_finance_accounts_updated_at ON finance_accounts;
CREATE TRIGGER update_finance_accounts_updated_at
    BEFORE UPDATE ON finance_accounts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_finance_categories_updated_at ON finance_categories;
CREATE TRIGGER update_finance_categories_updated_at
    BEFORE UPDATE ON finance_categories
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_finance_transactions_updated_at ON finance_transactions;
CREATE TRIGGER update_finance_transactions_updated_at
    BEFORE UPDATE ON finance_transactions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_finance_budgets_updated_at ON finance_budgets;
CREATE TRIGGER update_finance_budgets_updated_at
    BEFORE UPDATE ON finance_budgets
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_finance_income_streams_updated_at ON finance_income_streams;
CREATE TRIGGER update_finance_income_streams_updated_at
    BEFORE UPDATE ON finance_income_streams
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_finance_recurring_updated_at ON finance_recurring_transactions;
CREATE TRIGGER update_finance_recurring_updated_at
    BEFORE UPDATE ON finance_recurring_transactions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_finance_goals_updated_at ON finance_goals;
CREATE TRIGGER update_finance_goals_updated_at
    BEFORE UPDATE ON finance_goals
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Function: Update account balance after transaction
-- ============================================================================
CREATE OR REPLACE FUNCTION update_account_balance()
RETURNS TRIGGER AS $$
BEGIN
  -- Update source account balance
  IF TG_OP = 'INSERT' THEN
    IF NEW.transaction_type = 'expense' THEN
      UPDATE finance_accounts SET current_balance = current_balance - NEW.amount WHERE id = NEW.account_id;
    ELSIF NEW.transaction_type = 'income' THEN
      UPDATE finance_accounts SET current_balance = current_balance + NEW.amount WHERE id = NEW.account_id;
    ELSIF NEW.transaction_type = 'transfer' AND NEW.transfer_to_account_id IS NOT NULL THEN
      UPDATE finance_accounts SET current_balance = current_balance - NEW.amount WHERE id = NEW.account_id;
      UPDATE finance_accounts SET current_balance = current_balance + NEW.amount WHERE id = NEW.transfer_to_account_id;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    -- Reverse the transaction
    IF OLD.transaction_type = 'expense' THEN
      UPDATE finance_accounts SET current_balance = current_balance + OLD.amount WHERE id = OLD.account_id;
    ELSIF OLD.transaction_type = 'income' THEN
      UPDATE finance_accounts SET current_balance = current_balance - OLD.amount WHERE id = OLD.account_id;
    ELSIF OLD.transaction_type = 'transfer' AND OLD.transfer_to_account_id IS NOT NULL THEN
      UPDATE finance_accounts SET current_balance = current_balance + OLD.amount WHERE id = OLD.account_id;
      UPDATE finance_accounts SET current_balance = current_balance - OLD.amount WHERE id = OLD.transfer_to_account_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_account_balance ON finance_transactions;
CREATE TRIGGER trigger_update_account_balance
    AFTER INSERT OR DELETE ON finance_transactions
    FOR EACH ROW EXECUTE FUNCTION update_account_balance();

-- ============================================================================
-- Comments
-- ============================================================================
COMMENT ON TABLE finance_accounts IS 'Financial accounts (bank, credit card, investment, cash, etc.)';
COMMENT ON TABLE finance_categories IS 'Transaction categories - system-defined and user-customizable';
COMMENT ON TABLE finance_transactions IS 'Financial transactions - income, expenses, and transfers';
COMMENT ON TABLE finance_budgets IS 'Spending budgets by category with alerts and rollover support';
COMMENT ON TABLE finance_income_streams IS 'Recurring income sources (salary, freelance, investments, etc.)';
COMMENT ON TABLE finance_recurring_transactions IS 'Templates for recurring transactions with auto-creation support';
COMMENT ON TABLE finance_goals IS 'Financial goals - savings, debt payoff, emergency fund, etc.';
