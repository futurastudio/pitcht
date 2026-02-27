-- SMS Accountability Agent — Database Migration
-- Run this in your Supabase SQL editor
-- Date: 2026-02-24 (revised with constraints + indexes from engineering audit)

-- ─── Table: sms_preferences ────────────────────────────────────────────────────
-- One row per user — stores phone number, consent, and send window preference.
CREATE TABLE IF NOT EXISTS sms_preferences (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  phone_number        TEXT,                               -- E.164: +15551234567 (NULL until user enters it)
  phone_verified      BOOLEAN     NOT NULL DEFAULT FALSE,
  sms_opt_in          BOOLEAN     NOT NULL DEFAULT FALSE,  -- User checked the consent box
  sms_consent_at      TIMESTAMPTZ,                         -- When they opted in (TCPA record)
  sms_unsubscribed_at TIMESTAMPTZ,                         -- When they texted STOP (if ever)
  timezone            TEXT        NOT NULL DEFAULT 'America/New_York',  -- IANA timezone for 9AM–8PM window
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(user_id),

  -- Enforce: phone_number must be set if opt-in is enabled
  CONSTRAINT sms_opt_in_requires_phone
    CHECK (NOT sms_opt_in OR phone_number IS NOT NULL),

  -- Enforce: phone numbers stored in E.164 format (+1 followed by 10 digits)
  CONSTRAINT phone_number_e164_format
    CHECK (phone_number IS NULL OR phone_number ~ '^\+1[2-9]\d{9}$')
);

-- RLS: users can only read/write their own SMS preferences
ALTER TABLE sms_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own sms_preferences"
  ON sms_preferences FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own sms_preferences"
  ON sms_preferences FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own sms_preferences"
  ON sms_preferences FOR UPDATE
  USING (auth.uid() = user_id);

-- Index for cron job: fast lookup of all opted-in, unsubscribed users with phones
CREATE INDEX IF NOT EXISTS idx_sms_preferences_opt_in
  ON sms_preferences(sms_opt_in, sms_unsubscribed_at)
  WHERE sms_opt_in = TRUE AND sms_unsubscribed_at IS NULL;

-- Index for inbound webhook: look up user by phone number (STOP/START handling)
CREATE INDEX IF NOT EXISTS idx_sms_preferences_phone
  ON sms_preferences(phone_number)
  WHERE phone_number IS NOT NULL;

-- Trigger: keep updated_at current on any row update
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER sms_preferences_updated_at
  BEFORE UPDATE ON sms_preferences
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ─── Table: sms_messages ───────────────────────────────────────────────────────
-- Append-only audit log: every inbound/outbound SMS is recorded here.
-- Also serves as conversation history for Phase 2 two-way replies.
CREATE TABLE IF NOT EXISTS sms_messages (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  phone_number TEXT        NOT NULL,
  direction    TEXT        NOT NULL CHECK (direction IN ('outbound', 'inbound')),
  message      TEXT        NOT NULL,
  twilio_sid   TEXT        UNIQUE,  -- Twilio MessageSid; NULL for inbound (no SID on receive)
  trigger      TEXT        CHECK (trigger IN (
                              'inactivity_nudge', 'weekly_recap',
                              'score_milestone', 'score_decline', 'user_reply'
                            )),
  status       TEXT        NOT NULL DEFAULT 'sent'
                           CHECK (status IN ('sent', 'delivered', 'failed')),
  sent_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS: users can read their own message history
ALTER TABLE sms_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own sms_messages"
  ON sms_messages FOR SELECT
  USING (auth.uid() = user_id);

-- Service role inserts all messages (both outbound from API routes and inbound from webhook)
CREATE POLICY "Service role can insert sms_messages"
  ON sms_messages FOR INSERT
  WITH CHECK (TRUE);  -- API routes use service role key which bypasses RLS anyway

-- Index: daily dedup check in cron (user_id + direction + sent_at)
CREATE INDEX IF NOT EXISTS idx_sms_messages_user_sent
  ON sms_messages(user_id, direction, sent_at DESC);

-- Index: look up conversation thread by phone number (for Phase 2)
CREATE INDEX IF NOT EXISTS idx_sms_messages_phone_sent
  ON sms_messages(phone_number, sent_at DESC);


-- ─── Verify ────────────────────────────────────────────────────────────────────
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('sms_preferences', 'sms_messages');
