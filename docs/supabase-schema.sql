create table if not exists public.app_users (
  id uuid primary key,
  provider text not null,
  provider_id text not null,
  email text,
  display_name text,
  avatar_url text,
  role text not null default 'user',
  profile jsonb not null default '{}'::jsonb,
  disabled_at timestamptz,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(provider, provider_id)
);

create table if not exists public.conversations (
  id uuid primary key,
  user_id uuid not null references public.app_users(id) on delete cascade,
  persona_id text not null,
  relationship text not null,
  setting text not null,
  goal text not null,
  status text not null default 'active',
  feedback_text text,
  feedback_summary text,
  message_count integer not null default 0,
  user_message_count integer not null default 0,
  assistant_message_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz,
  hidden_by_user_at timestamptz
);

create table if not exists public.conversation_messages (
  id uuid primary key,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  role text not null,
  content text not null,
  sort_order integer not null,
  created_at timestamptz not null default now()
);

create table if not exists public.usage_events (
  id uuid primary key,
  user_id uuid references public.app_users(id) on delete set null,
  conversation_id uuid references public.conversations(id) on delete set null,
  event_type text not null,
  model text,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  estimated_cost_usd numeric(12, 6) not null default 0,
  estimated_cost_krw numeric(12, 2) not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.app_logs (
  id uuid primary key,
  level text not null default 'error',
  event_type text not null,
  message text not null default '',
  user_id uuid references public.app_users(id) on delete set null,
  conversation_id uuid references public.conversations(id) on delete set null,
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.app_feedbacks (
  id uuid primary key,
  user_id uuid references public.app_users(id) on delete set null,
  message text not null,
  page text not null default '',
  user_agent text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists idx_conversations_user_created on public.conversations(user_id, created_at desc);
create index if not exists idx_conversations_status on public.conversations(status);
create index if not exists idx_conversations_hidden_by_user_at on public.conversations(hidden_by_user_at);
create index if not exists idx_messages_conversation_order on public.conversation_messages(conversation_id, sort_order);
create index if not exists idx_usage_events_created on public.usage_events(created_at desc);
create index if not exists idx_usage_events_user_created on public.usage_events(user_id, created_at desc);
create index if not exists idx_usage_events_conversation on public.usage_events(conversation_id);
create index if not exists idx_app_logs_created_at on public.app_logs(created_at desc);
create index if not exists idx_app_logs_event_type on public.app_logs(event_type);
create index if not exists idx_app_logs_user_id on public.app_logs(user_id);
create index if not exists idx_app_logs_conversation_id on public.app_logs(conversation_id);
create index if not exists idx_app_feedbacks_created_at on public.app_feedbacks(created_at desc);
create index if not exists idx_app_feedbacks_user_id on public.app_feedbacks(user_id);

alter table public.app_logs enable row level security;
alter table public.app_feedbacks enable row level security;
