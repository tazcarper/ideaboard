-- IdeaBoard schema. Run this once in the Supabase SQL editor.

create extension if not exists "pgcrypto";

create table if not exists boards (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text,
  created_at timestamptz default now(),
  created_by uuid
);

create table if not exists notes (
  id uuid primary key default gen_random_uuid(),
  board_id uuid references boards(id) on delete cascade,
  x real not null,
  y real not null,
  width real default 200,
  height real default 200,
  color text not null,
  text text default '',
  z_index int default 0,
  updated_at timestamptz default now(),
  updated_by uuid
);

create table if not exists strokes (
  id uuid primary key default gen_random_uuid(),
  board_id uuid references boards(id) on delete cascade,
  color text not null,
  width real default 3,
  points jsonb not null,
  created_at timestamptz default now(),
  created_by uuid
);

create table if not exists note_votes (
  note_id uuid not null references notes(id) on delete cascade,
  user_id uuid not null,
  board_id uuid not null references boards(id) on delete cascade,
  value smallint not null check (value in (-1, 1)),
  updated_at timestamptz default now(),
  primary key (note_id, user_id)
);

create index if not exists notes_board_id_idx on notes(board_id);
create index if not exists strokes_board_id_idx on strokes(board_id);
create index if not exists note_votes_board_id_idx on note_votes(board_id);
create index if not exists note_votes_note_id_idx  on note_votes(note_id);

-- RLS: open read/write for v1. Tighten later.
alter table boards     enable row level security;
alter table notes      enable row level security;
alter table strokes    enable row level security;
alter table note_votes enable row level security;

drop policy if exists "boards_read"      on boards;
drop policy if exists "boards_insert"    on boards;
drop policy if exists "notes_read"       on notes;
drop policy if exists "notes_write"      on notes;
drop policy if exists "strokes_read"     on strokes;
drop policy if exists "strokes_write"    on strokes;
drop policy if exists "note_votes_read"  on note_votes;
drop policy if exists "note_votes_write" on note_votes;

create policy "boards_read"      on boards     for select using (true);
create policy "boards_insert"    on boards     for insert with check (true);
create policy "notes_read"       on notes      for select using (true);
create policy "notes_write"      on notes      for all    using (true) with check (true);
create policy "strokes_read"     on strokes    for select using (true);
create policy "strokes_write"    on strokes    for all    using (true) with check (true);
create policy "note_votes_read"  on note_votes for select using (true);
create policy "note_votes_write" on note_votes for all    using (true) with check (true);

-- Enable Realtime publication (so postgres_changes works on these tables).
alter publication supabase_realtime add table notes;
alter publication supabase_realtime add table strokes;
alter publication supabase_realtime add table note_votes;
