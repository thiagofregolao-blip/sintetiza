import { db } from './connection'

export const runMigrations = async () => {
  console.log('[DB] Executando migrations...')

  await db.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`)
  await db.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`)

  // ENUMs (DO $$ para ignorar se já existir)
  const enums = [
    `DO $$ BEGIN CREATE TYPE plan_type AS ENUM ('free', 'pro', 'business'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    `DO $$ BEGIN CREATE TYPE session_status AS ENUM ('connecting', 'connected', 'disconnected', 'error', 'banned'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    `DO $$ BEGIN CREATE TYPE chat_type AS ENUM ('group', 'individual'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    `DO $$ BEGIN CREATE TYPE media_type AS ENUM ('text', 'image', 'audio', 'video', 'document', 'sticker', 'location', 'contact', 'poll'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    `DO $$ BEGIN CREATE TYPE delivery_channel AS ENUM ('whatsapp', 'email', 'dashboard'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    `DO $$ BEGIN CREATE TYPE report_format AS ENUM ('short', 'detailed', 'executive'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    `DO $$ BEGIN CREATE TYPE keyword_type AS ENUM ('urgent', 'ignore', 'highlight'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    `DO $$ BEGIN CREATE TYPE digest_type AS ENUM ('daily', 'weekly', 'manual'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  ]
  for (const sql of enums) await db.query(sql)

  // Tables
  await db.query(`
    CREATE TABLE IF NOT EXISTS plans (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      name plan_type UNIQUE NOT NULL,
      max_groups INTEGER NOT NULL DEFAULT 3,
      max_digests_per_day INTEGER NOT NULL DEFAULT 1,
      retention_days INTEGER NOT NULL DEFAULT 30,
      max_keywords INTEGER NOT NULL DEFAULT 5,
      price_brl DECIMAL(10,2) NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)

  await db.query(`
    INSERT INTO plans (name, max_groups, max_digests_per_day, retention_days, max_keywords, price_brl)
    VALUES ('free', 3, 1, 30, 5, 0.00), ('pro', -1, 3, 90, 50, 29.00), ('business', -1, 6, 365, 200, 79.00)
    ON CONFLICT (name) DO NOTHING
  `)

  await db.query(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      name VARCHAR(100),
      plan plan_type NOT NULL DEFAULT 'free',
      timezone VARCHAR(50) NOT NULL DEFAULT 'America/Sao_Paulo',
      language VARCHAR(5) NOT NULL DEFAULT 'pt-BR',
      is_active BOOLEAN NOT NULL DEFAULT true,
      email_verified BOOLEAN NOT NULL DEFAULT false,
      datagrow_user_id UUID,
      datagrow_api_key VARCHAR(255),
      last_login_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)

  await db.query(`
    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash VARCHAR(255) NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)

  await db.query(`
    CREATE TABLE IF NOT EXISTS whatsapp_sessions (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      unipile_account_id VARCHAR(255) UNIQUE,
      phone_number_encrypted TEXT,
      display_name VARCHAR(100),
      status session_status NOT NULL DEFAULT 'connecting',
      qr_code TEXT,
      qr_expires_at TIMESTAMPTZ,
      connected_at TIMESTAMPTZ,
      last_activity_at TIMESTAMPTZ,
      disconnected_at TIMESTAMPTZ,
      error_message TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)

  await db.query(`
    CREATE TABLE IF NOT EXISTS groups (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      session_id UUID NOT NULL REFERENCES whatsapp_sessions(id) ON DELETE CASCADE,
      whatsapp_chat_id VARCHAR(255) NOT NULL,
      name VARCHAR(255),
      description TEXT,
      participant_count INTEGER DEFAULT 0,
      is_monitored BOOLEAN NOT NULL DEFAULT true,
      is_excluded BOOLEAN NOT NULL DEFAULT false,
      last_message_at TIMESTAMPTZ,
      message_count_today INTEGER NOT NULL DEFAULT 0,
      synced_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(user_id, whatsapp_chat_id)
    )
  `)

  await db.query(`
    CREATE TABLE IF NOT EXISTS messages (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      session_id UUID NOT NULL REFERENCES whatsapp_sessions(id) ON DELETE CASCADE,
      group_id UUID REFERENCES groups(id) ON DELETE SET NULL,
      chat_id VARCHAR(255) NOT NULL,
      chat_type chat_type NOT NULL,
      chat_name VARCHAR(255),
      sender_wa_id VARCHAR(50),
      sender_name VARCHAR(100),
      content TEXT,
      content_encrypted BOOLEAN NOT NULL DEFAULT false,
      media_type media_type NOT NULL DEFAULT 'text',
      has_media BOOLEAN NOT NULL DEFAULT false,
      media_url TEXT,
      is_mention BOOLEAN NOT NULL DEFAULT false,
      is_reply BOOLEAN NOT NULL DEFAULT false,
      urgency_score SMALLINT NOT NULL DEFAULT 1 CHECK (urgency_score BETWEEN 1 AND 5),
      keyword_matched VARCHAR(100)[],
      sentiment VARCHAR(20),
      included_in_digest BOOLEAN NOT NULL DEFAULT false,
      digest_id UUID,
      sent_at TIMESTAMPTZ NOT NULL,
      received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ,
      unipile_message_id VARCHAR(255) UNIQUE
    )
  `)

  await db.query(`
    CREATE TABLE IF NOT EXISTS keywords (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      word VARCHAR(100) NOT NULL,
      type keyword_type NOT NULL DEFAULT 'urgent',
      case_sensitive BOOLEAN NOT NULL DEFAULT false,
      is_active BOOLEAN NOT NULL DEFAULT true,
      match_count INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(user_id, word)
    )
  `)

  await db.query(`
    CREATE TABLE IF NOT EXISTS schedules (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      cron_expression VARCHAR(50) NOT NULL,
      delivery_channels delivery_channel[] NOT NULL DEFAULT '{dashboard}',
      report_format report_format NOT NULL DEFAULT 'detailed',
      is_active BOOLEAN NOT NULL DEFAULT true,
      last_run_at TIMESTAMPTZ,
      next_run_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)

  await db.query(`
    CREATE TABLE IF NOT EXISTS digests (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      schedule_id UUID REFERENCES schedules(id) ON DELETE SET NULL,
      type digest_type NOT NULL DEFAULT 'daily',
      period_start TIMESTAMPTZ NOT NULL,
      period_end TIMESTAMPTZ NOT NULL,
      content_json JSONB NOT NULL,
      content_text TEXT NOT NULL,
      content_html TEXT,
      total_messages INTEGER NOT NULL DEFAULT 0,
      total_groups INTEGER NOT NULL DEFAULT 0,
      total_individual INTEGER NOT NULL DEFAULT 0,
      urgent_count INTEGER NOT NULL DEFAULT 0,
      mention_count INTEGER NOT NULL DEFAULT 0,
      claude_tokens_input INTEGER NOT NULL DEFAULT 0,
      claude_tokens_output INTEGER NOT NULL DEFAULT 0,
      claude_model VARCHAR(50),
      delivered_via delivery_channel[],
      delivered_at TIMESTAMPTZ,
      delivery_error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)

  // Trigger
  await db.query(`
    CREATE OR REPLACE FUNCTION update_updated_at()
    RETURNS TRIGGER AS $t$
    BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
    $t$ LANGUAGE plpgsql
  `)

  const triggers = [
    { name: 'trg_users_updated', table: 'users' },
    { name: 'trg_sessions_updated', table: 'whatsapp_sessions' },
    { name: 'trg_groups_updated', table: 'groups' },
    { name: 'trg_schedules_updated', table: 'schedules' },
  ]
  for (const t of triggers) {
    await db.query(`
      DO $$ BEGIN
        CREATE TRIGGER ${t.name} BEFORE UPDATE ON ${t.table}
          FOR EACH ROW EXECUTE FUNCTION update_updated_at();
      EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `)
  }

  console.log('[DB] Migrations concluídas')
}
