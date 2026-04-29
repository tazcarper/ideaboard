-- Auth-aware RLS rewrite. Run after Google OAuth is enabled in the Supabase dashboard.
-- Mirror of the policies described in followUpPlans/PLAN_FOLLOWUP.md §1.

-- Pre-launch wipe: existing demo rows have created_by/updated_by = NULL and
-- would fail the ownership policies. We're pre-launch so we just clear them.
truncate table strokes;
truncate table notes;
delete from boards where created_by is null;

-- ── Reads: signed-in only. (Per-board read rules land in #3.)
drop policy if exists "boards_read"   on boards;
drop policy if exists "notes_read"    on notes;
drop policy if exists "strokes_read"  on strokes;

create policy "boards_read"  on boards  for select using (auth.uid() is not null);
create policy "notes_read"   on notes   for select using (auth.uid() is not null);
create policy "strokes_read" on strokes for select using (auth.uid() is not null);

-- ── Boards: signed-in users may insert; created_by must equal the caller.
drop policy if exists "boards_insert" on boards;
create policy "boards_insert" on boards for insert
  with check (auth.uid() is not null and auth.uid() = created_by);

-- ── Notes: any signed-in user may author or edit; the row's updated_by must
-- always reflect the current caller. The collaborative invariant ("updated_by
-- is whoever last touched it") is enforced by `with check`, NOT by `using` —
-- pinning `using` to `auth.uid() = updated_by` would lock notes to their first
-- author and break collaboration.
drop policy if exists "notes_write"  on notes;
drop policy if exists "notes_insert" on notes;
drop policy if exists "notes_update" on notes;
drop policy if exists "notes_delete" on notes;

create policy "notes_insert" on notes for insert
  with check (auth.uid() is not null and auth.uid() = updated_by);

create policy "notes_update" on notes for update
  using (auth.uid() is not null)
  with check (auth.uid() = updated_by);

-- Delete: only the most recent editor (== current updated_by) may delete.
-- This is what makes per-user undo of `note_delete` correct in #2.
create policy "notes_delete" on notes for delete
  using (auth.uid() = updated_by);

-- ── Strokes: insert pinned to caller, delete by original creator only,
-- no update path (strokes are immutable).
drop policy if exists "strokes_write"  on strokes;
drop policy if exists "strokes_insert" on strokes;
drop policy if exists "strokes_delete" on strokes;

create policy "strokes_insert" on strokes for insert
  with check (auth.uid() is not null and auth.uid() = created_by);

create policy "strokes_delete" on strokes for delete
  using (auth.uid() = created_by);
