-- =========================================================
-- PRAISE TABERNACLE - CONTACT MESSAGES TABLE (Supabase)
-- =========================================================
-- Run this in the Supabase SQL editor.
--
-- Security model:
--   * Row Level Security is enabled.
--   * No public policies are created, so anonymous visitors cannot read,
--     insert, update or delete messages.
--   * The serverless function uses the service_role key, which bypasses RLS.
--   * The service_role key must only ever exist in server environment variables.

create table if not exists public.contact_messages (
    id uuid primary key default gen_random_uuid(),
    full_name text not null,
    email text not null,
    phone text,
    subject text not null,
    message text not null,
    status text not null default 'unread'
        check (status in ('unread', 'read', 'archived')),
    source text not null default 'website',
    created_at timestamptz not null default now()
);

alter table public.contact_messages enable row level security;

-- Remove any accidental public access.
revoke all on table public.contact_messages from anon;
revoke all on table public.contact_messages from authenticated;

-- The backend uses the service role.
grant all on table public.contact_messages to service_role;

create index if not exists contact_messages_created_at_idx
    on public.contact_messages (created_at desc);

create index if not exists contact_messages_status_idx
    on public.contact_messages (status);

-- Helpful comment for the Supabase table editor.
comment on table public.contact_messages is
    'Messages submitted through the Praise Tabernacle website contact form.';
