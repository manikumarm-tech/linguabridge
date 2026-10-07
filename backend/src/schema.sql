CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  handle text UNIQUE NOT NULL,
  name text NOT NULL,
  language text NOT NULL DEFAULT 'en',
  output_format text NOT NULL DEFAULT 'both' CHECK (output_format IN ('native','romanized','both')),
  show_english boolean NOT NULL DEFAULT true,
  display_mode text NOT NULL DEFAULT 'original_translation'
    CHECK (display_mode IN ('translation_only','original_translation','original_translation_english')),
  translation_mode text NOT NULL DEFAULT 'casual' CHECK (translation_mode IN ('natural','literal','casual')),
  is_bot boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_a uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_b uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (user_a < user_b),
  UNIQUE (user_a, user_b)
);

CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  original_text text NOT NULL,
  kind text NOT NULL DEFAULT 'text' CHECK (kind IN ('text','voice')),
  -- full TranslationResult for the recipient (language/script/romanized/confidence live inside)
  translation jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS messages_conv_idx ON messages (conversation_id, created_at);

-- "Delete chat" is per user: messages up to cleared_at are hidden for that user only
CREATE TABLE IF NOT EXISTS conversation_clears (
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cleared_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, user_id)
);

-- 6-digit "add friend" codes: short-lived and single use
CREATE TABLE IF NOT EXISTS connect_codes (
  code text PRIMARY KEY CHECK (code ~ '^[0-9]{6}$'),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz
);
CREATE INDEX IF NOT EXISTS connect_codes_user_idx ON connect_codes (user_id);

-- Sign in with Google (accounts linked to Google can no longer sign in by username)
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_sub text UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url text;

-- presence and read receipts
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;
CREATE TABLE IF NOT EXISTS conversation_reads (
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, user_id)
);

-- groups: every chat has a member list (1:1 chats keep user_a/user_b for uniqueness)
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS is_group boolean NOT NULL DEFAULT false;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS title text;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE conversations ALTER COLUMN user_a DROP NOT NULL;
ALTER TABLE conversations ALTER COLUMN user_b DROP NOT NULL;
CREATE TABLE IF NOT EXISTS conversation_members (
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, user_id)
);
CREATE INDEX IF NOT EXISTS conversation_members_user_idx ON conversation_members (user_id);
INSERT INTO conversation_members (conversation_id, user_id)
  SELECT id, user_a FROM conversations WHERE user_a IS NOT NULL
  UNION SELECT id, user_b FROM conversations WHERE user_b IS NOT NULL
  ON CONFLICT DO NOTHING;

-- per-recipient translations (group chats: one per member)
CREATE TABLE IF NOT EXISTS message_translations (
  message_id uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  translation jsonb NOT NULL,
  PRIMARY KEY (message_id, user_id)
);

-- replies, delete for everyone, reactions, voice messages
ALTER TABLE messages ADD COLUMN IF NOT EXISTS reply_to uuid REFERENCES messages(id) ON DELETE SET NULL;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS has_audio boolean NOT NULL DEFAULT false;
CREATE TABLE IF NOT EXISTS message_reactions (
  message_id uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id)
);
CREATE TABLE IF NOT EXISTS message_audio (
  message_id uuid PRIMARY KEY REFERENCES messages(id) ON DELETE CASCADE,
  mime_type text NOT NULL,
  duration_ms integer,
  data bytea NOT NULL
);
