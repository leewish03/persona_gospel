alter table public.app_users
  add column if not exists deleted_at timestamptz null;

alter table public.usage_events
  add column if not exists provider text default 'openai';

alter table public.app_feedbacks
  add column if not exists category text default 'general',
  add column if not exists status text default 'new',
  add column if not exists priority text default 'normal',
  add column if not exists admin_note text default '',
  add column if not exists resolved_at timestamptz null,
  add column if not exists updated_at timestamptz null;

create index if not exists idx_app_users_deleted_at on public.app_users(deleted_at);
create index if not exists idx_usage_events_user_day on public.usage_events(user_id, created_at desc);
create index if not exists idx_app_feedbacks_status_created on public.app_feedbacks(status, created_at desc);

alter table public.app_users enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_messages enable row level security;
alter table public.usage_events enable row level security;
alter table public.app_feedbacks enable row level security;
alter table public.app_settings enable row level security;
