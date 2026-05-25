-- profiles (linked to Supabase Auth users)
create table if not exists public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  name text not null,
  email text not null,
  role text not null check (role in ('admin', 'manager', 'professional', 'financial')),
  professional_id text,
  active boolean default true,
  created_at timestamptz default now()
);

-- professionals
create table if not exists public.professionals (
  id text primary key default gen_random_uuid()::text,
  name text not null,
  email text not null default '',
  phone text default '',
  profession text not null,
  default_values jsonb default '{}',
  active boolean default true,
  notes text default '',
  created_at timestamptz default now()
);

-- clients
create table if not exists public.clients (
  id text primary key default gen_random_uuid()::text,
  company_name text not null,
  contact_name text default '',
  email text default '',
  phone text default '',
  status text default 'active',
  notes text default '',
  created_at timestamptz default now()
);

-- demands
create table if not exists public.demands (
  id text primary key default gen_random_uuid()::text,
  title text not null,
  description text default '',
  client_id text,
  professional_id text,
  task_type text not null,
  priority text default 'medium',
  status text default 'new',
  value decimal(10,2) default 0,
  deadline timestamptz,
  financial_registered boolean default false,
  completed_at timestamptz,
  created_at timestamptz default now(),
  created_by text,
  comments jsonb default '[]'
);

-- financial_movements
create table if not exists public.financial_movements (
  id text primary key default gen_random_uuid()::text,
  professional_id text,
  demand_id text,
  demand_title text,
  client_id text,
  client_name text,
  value decimal(10,2) not null,
  type text not null check (type in ('credit', 'debit')),
  status text default 'pending',
  completed_at timestamptz,
  paid_at timestamptz,
  paid_by text,
  created_at timestamptz default now()
);

-- audit_logs
create table if not exists public.audit_logs (
  id text primary key default gen_random_uuid()::text,
  entity_type text not null,
  entity_id text,
  action text not null,
  old_value text,
  new_value text,
  user_id text,
  user_name text,
  created_at timestamptz default now()
);

-- Disable RLS for now (internal tool)
alter table public.profiles disable row level security;
alter table public.professionals disable row level security;
alter table public.clients disable row level security;
alter table public.demands disable row level security;
alter table public.financial_movements disable row level security;
alter table public.audit_logs disable row level security;
