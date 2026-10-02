-- ============================================================
-- KNITNECT PRODUCTION ERP — CHAT & REALTIME MIGRATION
-- Enables multi-device real-time communication between Owner, Manager, and Employees
-- ============================================================

-- 1. CHAT CHANNELS TABLE
CREATE TABLE IF NOT EXISTS public.chat_channels (
  id TEXT PRIMARY KEY,
  org_id TEXT DEFAULT '00000000-0000-0000-0000-000000000001',
  type TEXT NOT NULL CHECK (type IN ('owner_manager', 'owner_employee', 'manager_employee', 'common')),
  participant_a_id TEXT,
  participant_b_id TEXT,
  participant_b_name TEXT,
  name TEXT,
  last_message TEXT,
  last_message_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. CHAT MESSAGES TABLE
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL REFERENCES public.chat_channels(id) ON DELETE CASCADE,
  sender_id TEXT NOT NULL,
  sender_name TEXT NOT NULL,
  sender_role TEXT,
  body TEXT NOT NULL,
  tagged_style_id TEXT,
  tagged_style_number TEXT,
  tagged_user_id TEXT,
  tagged_user_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. INDEX FOR FAST CHANNEL RETRIEVAL
CREATE INDEX IF NOT EXISTS idx_chat_messages_channel_created ON public.chat_messages(channel_id, created_at ASC);

-- 4. SEED DEFAULT SYSTEM CHANNELS (Idempotent)
INSERT INTO public.chat_channels (id, type, name, created_at)
VALUES 
  ('ch-common', 'common', 'All Company Operations', now()),
  ('ch-mgmt', 'owner_manager', 'Executive Management & Costing', now())
ON CONFLICT (id) DO NOTHING;

-- 5. ENABLE REALTIME BROADCASTING ON CHAT MESSAGES
-- This ensures when an employee sends a message, it appears instantly on the owner's screen without refreshing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND schemaname = 'public' 
    AND tablename = 'chat_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
  END IF;
END $$;

-- 6. ROW LEVEL SECURITY (Permissive for MVP / cross-device operations)
ALTER TABLE public.chat_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public access chat_channels" ON public.chat_channels;
CREATE POLICY "Public access chat_channels" ON public.chat_channels FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public access chat_messages" ON public.chat_messages;
CREATE POLICY "Public access chat_messages" ON public.chat_messages FOR ALL USING (true) WITH CHECK (true);
