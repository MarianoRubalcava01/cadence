-- Strava Plus — initial schema (Supabase / Postgres)
-- Run once in the Supabase SQL Editor (or: supabase db push).
-- Seeds NOTHING: no mock users, no sample activities. Every new account starts empty.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique,
  full_name text,
  avatar_url text,
  bio text,
  created_at timestamptz not null default now()
);

create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  sport text not null,
  title text not null,
  description text,
  distance_m integer not null default 0,
  moving_time_s integer not null default 0,
  elapsed_time_s integer not null default 0,
  elevation_gain_m integer not null default 0,
  calories integer not null default 0,
  avg_hr integer,
  max_hr integer,
  effort integer check (effort is null or (effort between 1 and 10)),
  location text,
  notes text,
  privacy text not null default 'public' check (privacy in ('public', 'followers', 'only_me')),
  gear_id uuid references public.gear (id) on delete set null,
  started_at timestamptz not null,
  created_at timestamptz not null default now(),
  route_geojson jsonb,
  photo_urls text[] not null default '{}'
);

create table if not exists public.activity_points (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities (id) on delete cascade,
  lat double precision not null,
  lng double precision not null,
  elevation double precision,
  recorded_at timestamptz not null,
  seq integer not null default 0
);

create table if not exists public.kudos (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (activity_id, user_id)
);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.follows (
  id uuid primary key default gen_random_uuid(),
  follower_id uuid not null references public.profiles (id) on delete cascade,
  following_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (follower_id, following_id),
  check (follower_id <> following_id)
);

create table if not exists public.clubs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.club_members (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'member',
  created_at timestamptz not null default now(),
  unique (club_id, user_id)
);

create table if not exists public.segments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sport text not null,
  start_lat double precision not null,
  start_lng double precision not null,
  end_lat double precision not null,
  end_lng double precision not null,
  distance_m integer not null default 0,
  created_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.segment_efforts (
  id uuid primary key default gen_random_uuid(),
  segment_id uuid not null references public.segments (id) on delete cascade,
  activity_id uuid not null references public.activities (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  elapsed_s integer not null,
  created_at timestamptz not null default now(),
  unique (segment_id, activity_id)
);

create table if not exists public.challenges (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  sport text not null default 'Any',
  metric text not null check (metric in ('distance', 'elevation', 'activities', 'time')),
  target numeric not null,
  unit text not null,
  start_date date not null,
  end_date date not null,
  created_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.challenge_entries (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.challenges (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  progress numeric not null default 0,
  created_at timestamptz not null default now(),
  unique (challenge_id, user_id)
);

create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  metric text not null check (metric in ('distance', 'time', 'activities', 'elevation')),
  target numeric not null,
  unit text not null,
  period text not null check (period in ('week', 'month')),
  created_at timestamptz not null default now()
);

create table if not exists public.gear (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  type text not null,
  brand text,
  model text,
  distance_m integer not null default 0,
  retire_at_m integer,
  created_at timestamptz not null default now()
);

create table if not exists public.routes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  sport text not null default 'Run',
  distance_m integer not null default 0,
  elevation_gain_m integer not null default 0,
  is_public boolean not null default true,
  route_geojson jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.training_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  goal_event text,
  start_date date not null,
  end_date date not null,
  weeks jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.beacon_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  activity_id uuid references public.activities (id) on delete set null,
  token text not null,
  is_live boolean not null default true,
  started_at timestamptz not null default now(),
  ended_at timestamptz
);

create table if not exists public.beacon_points (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.beacon_sessions (id) on delete cascade,
  lat double precision not null,
  lng double precision not null,
  recorded_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

create index if not exists idx_activities_user_started on public.activities (user_id, started_at desc);
create index if not exists idx_activity_points_activity on public.activity_points (activity_id, seq);
create index if not exists idx_kudos_activity on public.kudos (activity_id);
create index if not exists idx_comments_activity on public.comments (activity_id);
create index if not exists idx_follows_follower on public.follows (follower_id);
create index if not exists idx_follows_following on public.follows (following_id);
create index if not exists idx_club_members_club on public.club_members (club_id);
create index if not exists idx_segment_efforts_segment on public.segment_efforts (segment_id, elapsed_s);
create index if not exists idx_challenge_entries_challenge on public.challenge_entries (challenge_id);
create index if not exists idx_beacon_points_session on public.beacon_points (session_id, recorded_at);

-- ---------------------------------------------------------------------------
-- Auto-create a profile row when a user signs up
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username, full_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'full_name'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

create or replace function public.is_activity_readable(p_activity_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.activities a
    where a.id = p_activity_id
      and (
        a.privacy = 'public'
        or a.user_id = auth.uid()
        or (a.privacy = 'followers' and exists (
          select 1 from public.follows f
          where f.follower_id = auth.uid() and f.following_id = a.user_id
        ))
      )
  );
$$;

alter table public.profiles enable row level security;
alter table public.activities enable row level security;
alter table public.activity_points enable row level security;
alter table public.kudos enable row level security;
alter table public.comments enable row level security;
alter table public.follows enable row level security;
alter table public.clubs enable row level security;
alter table public.club_members enable row level security;
alter table public.segments enable row level security;
alter table public.segment_efforts enable row level security;
alter table public.challenges enable row level security;
alter table public.challenge_entries enable row level security;
alter table public.goals enable row level security;
alter table public.gear enable row level security;
alter table public.routes enable row level security;
alter table public.training_plans enable row level security;
alter table public.beacon_sessions enable row level security;
alter table public.beacon_points enable row level security;

-- Profiles: readable by everyone, editable only by the owner.
drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles for select using (true);
drop policy if exists "profiles_insert" on public.profiles;
create policy "profiles_insert" on public.profiles for insert with check (id = auth.uid());
drop policy if exists "profiles_update" on public.profiles;
create policy "profiles_update" on public.profiles for update using (id = auth.uid());

-- Activities: public to all, followers-only to followers, only-me to the owner.
drop policy if exists "activities_select" on public.activities;
create policy "activities_select" on public.activities for select using (
  privacy = 'public'
  or user_id = auth.uid()
  or (privacy = 'followers' and exists (
    select 1 from public.follows f
    where f.follower_id = auth.uid() and f.following_id = activities.user_id
  ))
);
drop policy if exists "activities_insert" on public.activities;
create policy "activities_insert" on public.activities for insert with check (user_id = auth.uid());
drop policy if exists "activities_update" on public.activities;
create policy "activities_update" on public.activities for update using (user_id = auth.uid());
drop policy if exists "activities_delete" on public.activities;
create policy "activities_delete" on public.activities for delete using (user_id = auth.uid());

-- Activity points follow the activity's visibility.
drop policy if exists "activity_points_select" on public.activity_points;
create policy "activity_points_select" on public.activity_points
  for select using (public.is_activity_readable(activity_id));
drop policy if exists "activity_points_insert" on public.activity_points;
create policy "activity_points_insert" on public.activity_points for insert with check (
  exists (select 1 from public.activities a where a.id = activity_points.activity_id and a.user_id = auth.uid())
);
drop policy if exists "activity_points_delete" on public.activity_points;
create policy "activity_points_delete" on public.activity_points for delete using (
  exists (select 1 from public.activities a where a.id = activity_points.activity_id and a.user_id = auth.uid())
);

-- Kudos and comments: only on activities the viewer can read; only your own rows to write.
drop policy if exists "kudos_select" on public.kudos;
create policy "kudos_select" on public.kudos for select using (public.is_activity_readable(activity_id));
drop policy if exists "kudos_insert" on public.kudos;
create policy "kudos_insert" on public.kudos for insert with check (user_id = auth.uid() and public.is_activity_readable(activity_id));
drop policy if exists "kudos_delete" on public.kudos;
create policy "kudos_delete" on public.kudos for delete using (user_id = auth.uid());

drop policy if exists "comments_select" on public.comments;
create policy "comments_select" on public.comments for select using (public.is_activity_readable(activity_id));
drop policy if exists "comments_insert" on public.comments;
create policy "comments_insert" on public.comments for insert with check (user_id = auth.uid() and public.is_activity_readable(activity_id));
drop policy if exists "comments_delete" on public.comments;
create policy "comments_delete" on public.comments for delete using (user_id = auth.uid());

-- Follows: readable by everyone; you can only follow/unfollow as yourself.
drop policy if exists "follows_select" on public.follows;
create policy "follows_select" on public.follows for select using (true);
drop policy if exists "follows_insert" on public.follows;
create policy "follows_insert" on public.follows for insert with check (follower_id = auth.uid());
drop policy if exists "follows_delete" on public.follows;
create policy "follows_delete" on public.follows for delete using (follower_id = auth.uid());

-- Clubs: readable by everyone; only the owner edits or deletes.
drop policy if exists "clubs_select" on public.clubs;
create policy "clubs_select" on public.clubs for select using (true);
drop policy if exists "clubs_insert" on public.clubs;
create policy "clubs_insert" on public.clubs for insert with check (auth.uid() is not null);
drop policy if exists "clubs_update" on public.clubs;
create policy "clubs_update" on public.clubs for update using (owner_id = auth.uid());
drop policy if exists "clubs_delete" on public.clubs;
create policy "clubs_delete" on public.clubs for delete using (owner_id = auth.uid());

-- Club members: join as yourself (or as the club owner adding someone).
drop policy if exists "club_members_select" on public.club_members;
create policy "club_members_select" on public.club_members for select using (true);
drop policy if exists "club_members_insert" on public.club_members;
create policy "club_members_insert" on public.club_members for insert with check (
  user_id = auth.uid()
  or exists (select 1 from public.clubs c where c.id = club_members.club_id and c.owner_id = auth.uid())
);
drop policy if exists "club_members_delete" on public.club_members;
create policy "club_members_delete" on public.club_members for delete using (
  user_id = auth.uid()
  or exists (select 1 from public.clubs c where c.id = club_members.club_id and c.owner_id = auth.uid())
);

-- Segments and efforts: readable by everyone; efforts are yours to write.
drop policy if exists "segments_select" on public.segments;
create policy "segments_select" on public.segments for select using (true);
drop policy if exists "segments_insert" on public.segments;
create policy "segments_insert" on public.segments for insert with check (auth.uid() is not null);
drop policy if exists "segments_update" on public.segments;
create policy "segments_update" on public.segments for update using (created_by = auth.uid());
drop policy if exists "segments_delete" on public.segments;
create policy "segments_delete" on public.segments for delete using (created_by = auth.uid());

drop policy if exists "segment_efforts_select" on public.segment_efforts;
create policy "segment_efforts_select" on public.segment_efforts for select using (true);
drop policy if exists "segment_efforts_insert" on public.segment_efforts;
create policy "segment_efforts_insert" on public.segment_efforts for insert with check (user_id = auth.uid());
drop policy if exists "segment_efforts_delete" on public.segment_efforts;
create policy "segment_efforts_delete" on public.segment_efforts for delete using (user_id = auth.uid());

-- Challenges and entries: readable by everyone; entries are yours to write.
drop policy if exists "challenges_select" on public.challenges;
create policy "challenges_select" on public.challenges for select using (true);
drop policy if exists "challenges_insert" on public.challenges;
create policy "challenges_insert" on public.challenges for insert with check (auth.uid() is not null);
drop policy if exists "challenges_update" on public.challenges;
create policy "challenges_update" on public.challenges for update using (created_by = auth.uid());
drop policy if exists "challenges_delete" on public.challenges;
create policy "challenges_delete" on public.challenges for delete using (created_by = auth.uid());

drop policy if exists "challenge_entries_select" on public.challenge_entries;
create policy "challenge_entries_select" on public.challenge_entries for select using (true);
drop policy if exists "challenge_entries_insert" on public.challenge_entries;
create policy "challenge_entries_insert" on public.challenge_entries for insert with check (user_id = auth.uid());
drop policy if exists "challenge_entries_update" on public.challenge_entries;
create policy "challenge_entries_update" on public.challenge_entries for update using (user_id = auth.uid());
drop policy if exists "challenge_entries_delete" on public.challenge_entries;
create policy "challenge_entries_delete" on public.challenge_entries for delete using (user_id = auth.uid());

-- Goals, gear, training plans: owner only.
drop policy if exists "goals_all" on public.goals;
create policy "goals_all" on public.goals for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "gear_all" on public.gear;
create policy "gear_all" on public.gear for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "training_plans_all" on public.training_plans;
create policy "training_plans_all" on public.training_plans for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Routes: public routes readable by everyone, private routes by the owner.
drop policy if exists "routes_select" on public.routes;
create policy "routes_select" on public.routes for select using (is_public or user_id = auth.uid());
drop policy if exists "routes_insert" on public.routes;
create policy "routes_insert" on public.routes for insert with check (user_id = auth.uid());
drop policy if exists "routes_update" on public.routes;
create policy "routes_update" on public.routes for update using (user_id = auth.uid());
drop policy if exists "routes_delete" on public.routes;
create policy "routes_delete" on public.routes for delete using (user_id = auth.uid());

-- Beacon: link-based. Anyone with the link can watch; only the owner writes.
drop policy if exists "beacon_sessions_select" on public.beacon_sessions;
create policy "beacon_sessions_select" on public.beacon_sessions for select using (true);
drop policy if exists "beacon_sessions_insert" on public.beacon_sessions;
create policy "beacon_sessions_insert" on public.beacon_sessions for insert with check (user_id = auth.uid());
drop policy if exists "beacon_sessions_update" on public.beacon_sessions;
create policy "beacon_sessions_update" on public.beacon_sessions for update using (user_id = auth.uid());

drop policy if exists "beacon_points_select" on public.beacon_points;
create policy "beacon_points_select" on public.beacon_points for select using (true);
drop policy if exists "beacon_points_insert" on public.beacon_points;
create policy "beacon_points_insert" on public.beacon_points for insert with check (
  exists (select 1 from public.beacon_sessions s where s.id = beacon_points.session_id and s.user_id = auth.uid())
);

-- ---------------------------------------------------------------------------
-- Storage: activity photos (public read, upload into your own folder)
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('activity-photos', 'activity-photos', true)
on conflict (id) do nothing;

drop policy if exists "photos_public_read" on storage.objects;
create policy "photos_public_read" on storage.objects
  for select using (bucket_id = 'activity-photos');
drop policy if exists "photos_upload_own" on storage.objects;
create policy "photos_upload_own" on storage.objects
  for insert with check (bucket_id = 'activity-photos' and auth.uid()::text = (storage.foldername(name))[1]);
drop policy if exists "photos_update_own" on storage.objects;
create policy "photos_update_own" on storage.objects
  for update using (bucket_id = 'activity-photos' and auth.uid()::text = (storage.foldername(name))[1]);
drop policy if exists "photos_delete_own" on storage.objects;
create policy "photos_delete_own" on storage.objects
  for delete using (bucket_id = 'activity-photos' and auth.uid()::text = (storage.foldername(name))[1]);

-- ---------------------------------------------------------------------------
-- Realtime: live Beacon points, kudos, comments, and new activities
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'beacon_points') then
    alter publication supabase_realtime add table public.beacon_points;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'beacon_sessions') then
    alter publication supabase_realtime add table public.beacon_sessions;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'comments') then
    alter publication supabase_realtime add table public.comments;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'kudos') then
    alter publication supabase_realtime add table public.kudos;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'activities') then
    alter publication supabase_realtime add table public.activities;
  end if;
end $$;
