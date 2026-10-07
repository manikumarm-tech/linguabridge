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
