-- ============================================================
-- KNITNECT PRODUCTION ERP — MIGRATION 002: RESET CHAT TABLES
-- Drops temporary insecure chat tables to prepare for Auth + RLS rebuild
-- ============================================================

DROP TABLE IF EXISTS public.chat_messages CASCADE;
DROP TABLE IF EXISTS public.chat_channels CASCADE;
