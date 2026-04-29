-- Auth-aware RLS for note_votes (added on main after 0001 ran).
-- Same shape as the per-row policies in 0001_auth_rls.sql.

drop policy if exists "note_votes_read"   on note_votes;
drop policy if exists "note_votes_write"  on note_votes;
drop policy if exists "note_votes_insert" on note_votes;
drop policy if exists "note_votes_update" on note_votes;
drop policy if exists "note_votes_delete" on note_votes;

create policy "note_votes_read" on note_votes for select
  using (auth.uid() is not null);

-- Insert / update / delete: a user may only act on their own votes.
create policy "note_votes_insert" on note_votes for insert
  with check (auth.uid() is not null and auth.uid() = user_id);

create policy "note_votes_update" on note_votes for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "note_votes_delete" on note_votes for delete
  using (auth.uid() = user_id);
