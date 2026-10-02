-- Migration 006: Add missing chat message & channel fields and reload schema cache
ALTER TABLE IF EXISTS public.chat_messages 
  ADD COLUMN IF NOT EXISTS sender_name TEXT,
  ADD COLUMN IF NOT EXISTS sender_role TEXT,
  ADD COLUMN IF NOT EXISTS tagged_style_number TEXT,
  ADD COLUMN IF NOT EXISTS tagged_user_name TEXT;

ALTER TABLE IF EXISTS public.chat_channels
  ADD COLUMN IF NOT EXISTS participant_b_name TEXT,
  ADD COLUMN IF NOT EXISTS last_message TEXT,
  ADD COLUMN IF NOT EXISTS last_message_at TIMESTAMPTZ;

-- Ensure update policy on chat_channels
DROP POLICY IF EXISTS "chat_channels_update" ON public.chat_channels;
CREATE POLICY "chat_channels_update" ON public.chat_channels
  FOR UPDATE
  TO authenticated
  USING (
    (org_id = current_user_org_id()) AND (
      (type = 'common') OR
      ((type = 'owner_manager') AND is_management()) OR
      (participant_a_id = auth.uid()) OR
      (participant_b_id = auth.uid())
    )
  )
  WITH CHECK (
    (org_id = current_user_org_id()) AND (
      (type = 'common') OR
      ((type = 'owner_manager') AND is_management()) OR
      (participant_a_id = auth.uid()) OR
      (participant_b_id = auth.uid())
    )
  );

NOTIFY pgrst, 'reload schema';

-- Ensure auth.users has non-null token fields for Supabase GoTrue
CREATE OR REPLACE FUNCTION public.fix_auth_tokens()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE auth.users
  SET 
    confirmation_token = COALESCE(confirmation_token, ''),
    recovery_token = COALESCE(recovery_token, ''),
    email_change_token_new = COALESCE(email_change_token_new, ''),
    email_change = COALESCE(email_change, ''),
    email_change_token_current = COALESCE(email_change_token_current, ''),
    reauthentication_token = COALESCE(reauthentication_token, ''),
    phone_change = COALESCE(phone_change, ''),
    phone_change_token = COALESCE(phone_change_token, '');
END;
$$;
SELECT public.fix_auth_tokens();
