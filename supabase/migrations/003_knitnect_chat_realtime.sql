-- ============================================================
-- KNITNECT PRODUCTION ERP — CHAT REALTIME FIX
-- Fixes channel ID foreign keys and allows instant multi-device sync
-- ============================================================

-- 1. DROP RESTRICTIVE FOREIGN KEY CONSTRAINT ON CHANNEL_ID
-- This ensures any channel ID used by the app can send and receive messages without constraint errors
ALTER TABLE IF EXISTS public.chat_messages DROP CONSTRAINT IF EXISTS chat_messages_channel_id_fkey;

-- 2. ENSURE CHAT TABLES EXIST WITH TEXT IDS
CREATE TABLE IF NOT EXISTS public.chat_channels (
  id TEXT PRIMARY KEY,
  org_id TEXT DEFAULT '00000000-0000-0000-0000-000000000001',
  type TEXT NOT NULL,
  name TEXT,
  last_message TEXT,
  last_message_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.chat_messages (
  id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL,
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

-- 3. DISABLE RLS ON CHAT TABLES
-- Knitnect uses application-layer RBAC. Disabling RLS allows the anon key to write messages across devices
ALTER TABLE public.chat_channels DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages DISABLE ROW LEVEL SECURITY;

-- 4. SEED ALL ERP CHANNELS
INSERT INTO public.chat_channels (id, type, name, created_at)
VALUES 
  ('40000000-0000-0000-0000-000000000001', 'common', 'General / Floor Updates', now()),
  ('40000000-0000-0000-0000-000000000002', 'owner_manager', 'Executive: Owner & Manager', now()),
  ('40000000-0000-0000-0000-000000000003', 'owner_employee', 'Owner DM: Murugan (Cutting)', now()),
  ('40000000-0000-0000-0000-000000000004', 'manager_employee', 'Manager DM: Murugan (Cutting)', now()),
  ('ch-common', 'common', 'General / Floor Updates', now()),
  ('ch-mgmt', 'owner_manager', 'Executive: Owner & Manager', now())
ON CONFLICT (id) DO NOTHING;

-- 5. ENSURE REALTIME REPLICATION IS ENABLED
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
