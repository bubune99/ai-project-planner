-- Migration 029: Calendar Module
-- JARVIS Personal Assistant - Calendar Events with Source Tracking and Recurrence

-- Event source type enum
DO $$ BEGIN
  CREATE TYPE event_source AS ENUM ('manual', 'todo', 'project', 'travel', 'external', 'finance', 'idea');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Recurrence frequency enum
DO $$ BEGIN
  CREATE TYPE recurrence_frequency AS ENUM ('daily', 'weekly', 'biweekly', 'monthly', 'yearly', 'custom');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Event status enum
DO $$ BEGIN
  CREATE TYPE event_status AS ENUM ('confirmed', 'tentative', 'cancelled');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- Calendar Events Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS calendar_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Basic event info
  title VARCHAR(255) NOT NULL,
  description TEXT,

  -- Timing
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ,
  is_all_day BOOLEAN DEFAULT false,
  timezone VARCHAR(50) DEFAULT 'UTC',

  -- Source tracking - where this event came from
  source event_source DEFAULT 'manual',
  source_id UUID,  -- ID of the source record (todo_id, project_id, etc.)
  source_metadata JSONB DEFAULT '{}',  -- Additional source context

  -- Recurrence (iCalendar RRULE format compatible)
  is_recurring BOOLEAN DEFAULT false,
  recurrence_rule JSONB,  -- { frequency, interval, until, count, byDay, byMonth, etc. }
  recurrence_parent_id UUID REFERENCES calendar_events(id) ON DELETE CASCADE,
  recurrence_index INTEGER,  -- Instance index for recurring events

  -- Location
  location_name VARCHAR(255),
  location_address TEXT,
  location_lat DECIMAL(10, 8),
  location_lng DECIMAL(11, 8),
  location_url VARCHAR(500),  -- Virtual meeting link

  -- Attendees (stored as JSONB array)
  attendees JSONB DEFAULT '[]',  -- [{ email, name, status: accepted/declined/tentative, isOrganizer }]

  -- Reminders (stored as JSONB array)
  reminders JSONB DEFAULT '[{"type": "notification", "minutes": 30}]',  -- [{ type: email/notification/sms, minutes }]

  -- Visual
  color VARCHAR(7),  -- Hex color
  icon VARCHAR(50),

  -- Status
  status event_status DEFAULT 'confirmed',
  is_private BOOLEAN DEFAULT false,

  -- External calendar sync
  external_id VARCHAR(255),  -- ID from external calendar (Google, Outlook, etc.)
  external_calendar VARCHAR(50),  -- google, outlook, apple, etc.
  external_etag VARCHAR(255),  -- For sync conflict detection
  last_synced_at TIMESTAMPTZ,

  -- Metadata
  tags TEXT[] DEFAULT '{}',
  metadata JSONB DEFAULT '{}',

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- ============================================================================
-- Calendar Categories/Calendars (for organizing events)
-- ============================================================================
CREATE TABLE IF NOT EXISTS calendar_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  name VARCHAR(100) NOT NULL,
  color VARCHAR(7),
  icon VARCHAR(50),
  is_visible BOOLEAN DEFAULT true,
  is_default BOOLEAN DEFAULT false,

  -- External calendar link
  external_id VARCHAR(255),
  external_calendar VARCHAR(50),

  order_index INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, name)
);

-- Add category reference to events
ALTER TABLE calendar_events
ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES calendar_categories(id) ON DELETE SET NULL;

-- ============================================================================
-- Event Reminders Log (for tracking sent reminders)
-- ============================================================================
CREATE TABLE IF NOT EXISTS calendar_reminder_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES calendar_events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  reminder_type VARCHAR(20) NOT NULL,  -- email, notification, sms
  scheduled_for TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ,
  status VARCHAR(20) DEFAULT 'pending',  -- pending, sent, failed
  error_message TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- Indexes for Performance
-- ============================================================================

-- User's events by date range (most common query)
CREATE INDEX IF NOT EXISTS idx_calendar_events_user_date
ON calendar_events(user_id, start_time, end_time)
WHERE deleted_at IS NULL;

-- Source-based lookups (find events from a specific todo/project)
CREATE INDEX IF NOT EXISTS idx_calendar_events_source
ON calendar_events(source, source_id)
WHERE deleted_at IS NULL;

-- Recurring event parent lookup
CREATE INDEX IF NOT EXISTS idx_calendar_events_recurrence_parent
ON calendar_events(recurrence_parent_id)
WHERE recurrence_parent_id IS NOT NULL;

-- External calendar sync
CREATE INDEX IF NOT EXISTS idx_calendar_events_external
ON calendar_events(external_calendar, external_id)
WHERE external_id IS NOT NULL;

-- Category events
CREATE INDEX IF NOT EXISTS idx_calendar_events_category
ON calendar_events(category_id)
WHERE category_id IS NOT NULL;

-- Reminder scheduling
CREATE INDEX IF NOT EXISTS idx_calendar_reminders_scheduled
ON calendar_reminder_logs(scheduled_for, status)
WHERE status = 'pending';

-- ============================================================================
-- Triggers
-- ============================================================================

-- Auto-update timestamp
CREATE OR REPLACE FUNCTION update_calendar_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_calendar_events_updated_at ON calendar_events;
CREATE TRIGGER trigger_calendar_events_updated_at
  BEFORE UPDATE ON calendar_events
  FOR EACH ROW
  EXECUTE FUNCTION update_calendar_updated_at();

DROP TRIGGER IF EXISTS trigger_calendar_categories_updated_at ON calendar_categories;
CREATE TRIGGER trigger_calendar_categories_updated_at
  BEFORE UPDATE ON calendar_categories
  FOR EACH ROW
  EXECUTE FUNCTION update_calendar_updated_at();

-- ============================================================================
-- Default Categories
-- ============================================================================
-- These will be created per-user when they first access the calendar

-- ============================================================================
-- Comments
-- ============================================================================
COMMENT ON TABLE calendar_events IS 'Calendar events with support for source tracking, recurrence, and external calendar sync';
COMMENT ON COLUMN calendar_events.source IS 'Where this event originated: manual entry, from a todo due date, project milestone, travel itinerary, or external calendar';
COMMENT ON COLUMN calendar_events.source_id IS 'Foreign key to the source record (todo_id, project_id, etc.) - not enforced to allow flexibility';
COMMENT ON COLUMN calendar_events.recurrence_rule IS 'iCalendar RRULE compatible recurrence definition as JSON';
COMMENT ON COLUMN calendar_events.attendees IS 'Array of attendee objects with email, name, status, and isOrganizer flag';
COMMENT ON COLUMN calendar_events.reminders IS 'Array of reminder definitions with type (email/notification/sms) and minutes before event';
