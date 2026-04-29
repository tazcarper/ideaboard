# IdeaBoard — Post-v1 Follow-up Plan

Three features stack on top of the v1 in `PLAN.md`:

1. **Google OAuth login** replacing the anonymous-auth placeholder.
2. **Per-user undo** that only reverts the current user's own actions.
3. **Public / private boards** where the creator can set a word as the password.

The order matters. Auth is the foundation — undo needs a stable `user_id` to scope reverts, and private boards need an owner to gate writes. Build #1 first, then #2 and #3 in either order (they're independent).

## State of the codebase as of this plan

- `supabase/schema.sql` already has `boards.created_by`, `notes.updated_by`, `strokes.created_by` — but the app never populates them (`BoardSurface.tsx` sets `created_by: null` when inserting).
- RLS is enabled but every policy is `using (true)` — effectively open.
- `/api/boards` POST uses the **service-role** admin client, so it bypasses RLS and has no user context.
- There is no sign-in flow, no auth callback, no middleware refreshing sessions.
- Phase 3 of `PLAN.md` mentions anonymous Supabase auth; that step was skipped.

So "switch from anonymous to Google" is really "introduce real auth for the first time."

---

## 1. Google OAuth login

### Goal

A user signs in with Google before they can create or interact with a board. We keep their `auth.users.id` as the canonical user id, plus name and avatar from Google for presence cursors.

### Why not keep anonymous as a fallback

The other two features (per-user undo, private-board ownership) are meaningless without a stable identity that survives across devices and sessions. Mixing anonymous + Google identities creates two classes of users and double the RLS complexity. Pick one. Google.

### Provider setup (one-time, manual)

The OAuth dance terminates at Supabase, then Supabase bounces to our app. So Google's allowlist and Supabase's allowlist hold **different** URLs — don't mix them up.

1. Google Cloud Console → create OAuth 2.0 Client (Web).
2. **Google's "Authorized redirect URIs"** — only one entry, the Supabase callback:
   - `https://<project-ref>.supabase.co/auth/v1/callback`
3. In Supabase dashboard → **Authentication → Providers → Google** → paste client ID + secret, enable.
4. Supabase **Auth → URL Configuration** → set Site URL to the prod domain, and add **our app's** post-OAuth landing URLs to "Additional Redirect URLs":
   - `http://localhost:3000/auth/callback`
   - `https://<vercel-prod-domain>/auth/callback`
   - `https://*.vercel.app/auth/callback` (preview deploys)

### Code changes

**New files**

- `app/auth/callback/route.ts` — exchanges the `?code=` PKCE token for a session, then redirects to `next`.
  - **Validate `next` against open redirect.** Accept only same-origin paths: `next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\")`. Anything else → fall back to `/`. Without this, `?next=https://evil.com` lands signed-in users on an attacker site.
  - **Error path.** Catch user-cancel (`?error=access_denied`), `exchangeCodeForSession` failures, and missing-code cases. On any error, redirect to `/?auth_error=<short_code>` and surface a toast on the landing page.
- `middleware.ts` — keeps the Supabase session cookie fresh so server components see the current user.
  - Use `createServerClient` from `@supabase/ssr` with the cookies adapter and **`await supabase.auth.getUser()`** — never `getSession()`. `getSession()` only reads the cookie; `getUser()` revalidates the JWT against Supabase's auth server, which is what makes a tampered cookie fail.
  - `matcher` should exclude static assets and image optimization: `['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)']`.
  - Verify against `node_modules/next/dist/docs/` for any 16-canary middleware quirks before writing.
- `app/auth/sign-out/route.ts` (or a server action) — calls `supabase.auth.signOut()` server-side, then `redirect("/")`. **Don't sign out from a client component**; the HttpOnly auth cookies need to be cleared by a Set-Cookie response, and stale RSC payloads need a route refresh.
- `components/SignInButton.tsx` (`"use client"`) — calls `supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: \`${window.location.origin}/auth/callback?next=${encodeURIComponent(currentPath)}\` } })`. Must be a client component because `window.location.origin` is browser-only — server-rendering would capture the Node origin and break the flow.
- `components/UserMenu.tsx` — shows Google avatar + name, "Sign out" item that POSTs to the sign-out route above.
- `lib/auth.ts` — `getUser()` server helper. Wrap with **React 19's `cache()`** for per-request memoization:
  ```ts
  import { cache } from "react";
  import { createClient } from "@/lib/supabase/server";
  export const getUser = cache(async () => {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    return user;
  });
  ```
  Module-level memoization (e.g. a top-level `let cached` or `Map`) would leak one user's identity into another user's render. `cache()` is per-request and resets between requests automatically.

**Modified files**

- `app/page.tsx` — gate the "Create board" CTA: signed-out users see "Sign in with Google to create a board" instead. Also: read `?auth_error=` and render a toast.
- `app/b/[slug]/page.tsx` — call `getUser()`, redirect to `/?next=/b/<slug>` if signed out (after #3 lands, also enforce visibility here).
- `app/api/boards/route.ts` — switch from admin client to the **user-bound server client** so RLS sees the caller. Pass `created_by: user.id` on insert. Reject (401) if no user. Add a per-user rate limit (e.g. 30 boards/hour) — switching to user-bound auth closes the anonymous-spam vector but a single account can still flood; pick Vercel KV or a `select count(*) from boards where created_by = $1 and created_at > now() - interval '1 hour'` check.
- `components/Board/BoardSurface.tsx` — populate `created_by` / `updated_by` from a `useUser()` hook on every insert/update. This is what makes undo (#2) and the private-board owner check (#3) actually work. **Every `update` call must also re-set `updated_by` to the current user**, not just `text`/`x`/`y` — the RLS `with check` (see RLS rewrite below) requires it.
- `components/CreateBoardButton.tsx` — disable until signed in; if 401 from API, redirect to sign-in.
- `lib/db.ts` — drop the module-level `const supabase = createClient()` singleton. Build the client per-call (or via a React context provider) so a sign-out tears down stale auth state. With the canary `@supabase/supabase-js` pinned in `package.json` we cannot assume the singleton picks up new cookies — verify, or just stop relying on it.
- `lib/supabase/client.ts` — set `flow_type: 'pkce'` explicitly in the auth options. It is the @supabase/ssr default, but the canary pin means "default" is not load-bearing.

### Schema migration

`auth.users` rows now exist. Existing demo `boards`/`notes`/`strokes` rows have `created_by = NULL`. Two options:

- **Wipe demo data** — easiest, since v1 hasn't shipped to anyone.
- **Adopt nulls as "legacy"** — they remain readable but cannot be undone or owned. Add `created_by uuid references auth.users(id)` only as a non-enforced reference (already nullable).

Recommendation: wipe. We're pre-launch.

### RLS rewrite (lands in this phase, even though stricter rules come with #3)

The policies below are designed around three rules that are easy to get wrong:

1. **Reads must require a signed-in user once auth lands.** Leaving them `using (true)` between #1 and #3 means anyone with the anon key can dump every board's content during the interim. Cheap to close now.
2. **`updated_by` / `created_by` on insert must equal `auth.uid()`.** Without this `with check`, a signed-in attacker can insert rows attributed to another user and lock the legitimate user out of their own subsequent edits.
3. **Updates must be permitted for any signed-in user, but the new `updated_by` must be the caller.** If we gate `update` on `using (auth.uid() = updated_by)`, only the *first* author of the note can ever edit it again — that's per-user notes, not a collaborative whiteboard. The collaborative read of "the row's `updated_by` reflects whoever last touched it" is enforced by the `with check`, not by `using`.

```sql
-- ── Reads: gate on signed-in. (Stricter per-board read rules land in #3.)
drop policy "boards_read"  on boards;
drop policy "notes_read"   on notes;
drop policy "strokes_read" on strokes;
create policy "boards_read"  on boards  for select using (auth.uid() is not null);
create policy "notes_read"   on notes   for select using (auth.uid() is not null);
create policy "strokes_read" on strokes for select using (auth.uid() is not null);

-- ── Boards: only signed-in users insert; created_by must be the caller.
drop policy "boards_insert" on boards;
create policy "boards_insert" on boards for insert
  with check (auth.uid() is not null and auth.uid() = created_by);

-- ── Notes: any signed-in user can author or edit; updated_by must always equal the caller.
drop policy "notes_write" on notes;

create policy "notes_insert" on notes for insert
  with check (auth.uid() is not null and auth.uid() = updated_by);

-- NOTE: the `using` predicate is "any signed-in user". The collaborative invariant
-- ("updated_by reflects whoever last touched the row") is enforced by `with check`,
-- which runs against the POST-update row. Pinning `using` to `auth.uid() = updated_by`
-- would lock every note to its first author and break collaboration.
create policy "notes_update" on notes for update
  using (auth.uid() is not null)
  with check (auth.uid() = updated_by);

-- Delete: only the most recent editor (== current `updated_by`) can delete.
-- This is what makes per-user undo of `note_delete` correct in #2.
create policy "notes_delete" on notes for delete
  using (auth.uid() = updated_by);

-- ── Strokes: insert pinned to caller, delete by original creator only, no update path.
drop policy "strokes_write" on strokes;
create policy "strokes_insert" on strokes for insert
  with check (auth.uid() is not null and auth.uid() = created_by);
create policy "strokes_delete" on strokes for delete
  using (auth.uid() = created_by);
```

`updated_by` on a note is whoever last touched it — not the original author. The `with check` on `notes_update` enforces that invariant: every successful update sets `updated_by` to `auth.uid()`. **The client must therefore always include `updated_by: user.id` in every `update notes` call, alongside `text` / `x` / `y`** — leaving it out keeps the old value, which fails the check for any non-original author and silently breaks collaborative editing. Bake this into the helper in `lib/db.ts`.

Implication for #2 (per-user undo): undo of a `note_update` only succeeds if the row's *current* `updated_by` is still you. If someone else has edited since, your undo is rejected by RLS — which is exactly the behavior #2 already specifies ("Couldn't undo: this note was changed by someone else.").

#### Migration safety in production

These policies replace `using (true)` with stricter ones. Flipping them while clients are connected will cause some in-flight writes to fail with `42501 permission denied`. Two options:

- **Pre-launch (current state):** just run the migration. There are no real users.
- **Post-launch:** wrap in a transaction, deploy the auth/middleware changes first (so the next client load already sends a JWT), then flip RLS in a follow-up migration. Have the client retry once on `42501` after a `supabase.auth.getUser()` refresh.

### Done when

- Visiting `/` while signed-out shows "Sign in with Google", not the create button.
- After signing in I land back on `/`, see my avatar, can create a board, and the new row's `created_by` matches `auth.uid()` in the DB.
- Sign-out (via the server action / route, not a client-only `signOut()`) clears the session cookies in DevTools and bounces me back to `/`.

**Security checks (must all pass):**

- `?next=https://evil.com` and `?next=//evil.com` after sign-in both redirect to `/`, not to evil.com.
- Middleware uses `supabase.auth.getUser()`, not `getSession()` — confirm by grepping the file.
- A second user (User B) can edit a note that User A created. Before the RLS rewrite this would have been broken by the original `using (auth.uid() = updated_by)` policy.
- A signed-in attacker cannot insert a note with `updated_by` set to another user's id (RLS rejects with `42501`).
- Tampering with the `sb-*` auth cookie causes the next request to be treated as signed-out (because middleware revalidates via `getUser()`).
- Reads of `notes`, `strokes`, `boards` from an anonymous (no-cookie) client return zero rows, not the full table.

**Realtime sanity check (smoke test before #3 lands):**

- Open the board in two browsers, both signed in. Confirm `postgres_changes` deliver inserts/updates/deletes both ways. If they don't, the browser Supabase client isn't sending the JWT to Realtime — call `supabase.realtime.setAuth(session.access_token)` after sign-in (and on `TOKEN_REFRESHED`).

---

## 2. Per-user undo

### Goal

`Cmd/Ctrl+Z` reverts the **current user's** last action on this board, in this tab. Other users' actions are never touched. Stack is at least 50 deep, in-memory only.

### Why not server-side undo

The action history is local to one user's session. Persisting it adds a table, sync logic, and conflict semantics across devices, for a feature most users hit a few times in a row. Skip until someone asks.

### Action model

Add an `actionLog` slice to `useBoardStore`:

```ts
type Action =
  | { kind: "stroke_add"; stroke: Stroke }
  | { kind: "note_add"; note: Note }
  | { kind: "note_update"; id: string; before: Note; after: Note }
  | { kind: "note_delete"; note: Note };
```

Every authoring path pushes onto the stack:

| User action | Action recorded |
|---|---|
| Pen up after a stroke | `stroke_add` |
| Click empty space with note tool | `note_add` |
| Drag note to new position | `note_update` (before snapshot taken on pointerdown) |
| Edit note text (debounced commit) | `note_update` |
| Eraser hits a stroke I created | `stroke_add` (inverse — undo re-inserts) |
| Eraser hits a note I last touched | `note_delete` |

Eraser deleting **someone else's** stroke or note is **not** added to my undo stack — I can't undo their stroke back into existence because I don't own it (RLS would block it anyway).

### Undo semantics per kind

- `stroke_add` → DELETE the stroke. RLS already requires `auth.uid() = created_by`, so this only works for my own strokes. If another user erased it before I undid, the delete is a no-op. Pop and move on.
- `note_add` → DELETE the note. Same RLS check on `updated_by`. **Edge case:** if someone else edited the note text after I created it, my undo deletes their work too. Acceptable for v1, but show a toast: "Undid your note. It had been edited by Sam."
- `note_update` → `update notes set ...before` where `id = ?`. Will only succeed if `updated_by = auth.uid()`. If a remote update has come in since (someone else now owns `updated_by`), my undo is rejected — pop the action and surface a toast: "Couldn't undo: this note was changed by someone else."
- `note_delete` → re-INSERT the note row from snapshot.

After every successful undo, push the **inverse** onto a redo stack (out of scope for this pass — leaving the redo stack empty is fine).

### Crucial invariant: don't echo remote changes into the undo stack

The realtime subscription (Phase 3 in `PLAN.md`) will eventually re-deliver my own writes back to me via `postgres_changes`. The store must distinguish:

- **Local action** — pushed to undo stack.
- **Remote echo** of my action — already in the stack, skip.
- **Remote action by another user** — apply to state, never push.

Easiest discriminator: every realtime callback compares row `created_by`/`updated_by` against `auth.uid()`. If equal, it's an echo — only update local state if the version is newer. Don't push to the stack.

### UX

- Hotkey: `Cmd+Z` (Mac), `Ctrl+Z` (Win/Linux) — bound on the board page only, not the toolbar.
- Toolbar gets a circular-arrow undo button, disabled when stack is empty.
- Toast for the conflict cases above. Use a tiny `<output role="status">` with a 3s timeout, no library needed.
- Stack cap = 50; oldest entries fall off.
- Stack does **not** persist across reload. That's by design — once you refresh, the world is what's in the DB.

### Done when

- I draw a stroke, hit Cmd+Z, the stroke vanishes for me and (within a tick, via realtime) for everyone else.
- I drag a note, someone else also drags it, I hit Cmd+Z — toast says I can't undo because they touched it.
- Cmd+Z on a board where I haven't done anything is a no-op (no foreign actions get reverted).

---

## 3. Public / private boards with a password

### Goal

The board creator picks a visibility:

- **Public** — anyone signed in (with Google, after #1) can open and edit.
- **Private** — only the creator can open and edit by default. To let someone else in, the creator sets a one-word password and shares it. Visitors enter the word once, then have access for that board.

### Schema

```sql
alter table boards
  add column visibility text not null default 'public'
    check (visibility in ('public', 'private')),
  add column password_hash text;  -- bcrypt via pgcrypto, NULL when public

create table board_members (
  board_id uuid not null references boards(id) on delete cascade,
  user_id  uuid not null references auth.users(id) on delete cascade,
  role     text not null check (role in ('owner', 'guest')),
  granted_at timestamptz default now(),
  primary key (board_id, user_id)
);

create index board_members_user_idx on board_members(user_id);

-- Backfill: every existing board's creator becomes its owner.
insert into board_members (board_id, user_id, role)
  select id, created_by, 'owner' from boards where created_by is not null
  on conflict do nothing;
```

A trigger on `boards` insert auto-creates the owner row in `board_members` so the application code can't forget.

### Why a `board_members` table and not just a cookie

Realtime is the catch. `postgres_changes` subscriptions enforce RLS at the row level, against `auth.uid()`. A signed cookie that proves "I entered the password" lives only in HTTP-land — Supabase Realtime won't see it. So we need the password check to translate into a **database-visible grant**, which is exactly what a `board_members` row is.

This also means once you've entered the password, you're a member forever (until the owner revokes), which matches the "share a link + a password" mental model better than "re-enter every session."

### RLS for boards / notes / strokes (replaces the policies from #1)

```sql
-- Helper inline-able predicate: can this user read this board?
-- (Materialize as a security-definer function for performance if needed.)
create or replace function can_read_board(b uuid) returns boolean
language sql stable as $$
  select exists (
    select 1 from boards where id = b and visibility = 'public'
  ) or exists (
    select 1 from board_members where board_id = b and user_id = auth.uid()
  )
$$;

create or replace function can_write_board(b uuid) returns boolean
language sql stable as $$
  select auth.uid() is not null and (
    exists (select 1 from boards where id = b and visibility = 'public')
    or exists (select 1 from board_members where board_id = b and user_id = auth.uid())
  )
$$;

drop policy "boards_read"   on boards;
create policy "boards_read" on boards for select
  using (can_read_board(id));

create policy "boards_update" on boards for update
  using (created_by = auth.uid());  -- only the creator can change visibility/password

drop policy "notes_read" on notes;
create policy "notes_read" on notes for select using (can_read_board(board_id));
drop policy "notes_insert" on notes;
create policy "notes_insert" on notes for insert with check (can_write_board(board_id));
-- update/delete policies from #1 stay as-is (owner-of-row check)

-- mirror for strokes
```

### Hashing

Use `pgcrypto`'s `crypt(password, gen_salt('bf'))`. Single round of bcrypt, server-side, never on the client. The password never goes into a column directly — only the hash.

```sql
-- Owner sets/changes the password (called from a route handler).
update boards
  set password_hash = crypt($1, gen_salt('bf')),
      visibility = 'private'
  where id = $2 and created_by = auth.uid();
```

### Routes

**`POST /api/boards/[slug]/settings`** — owner-only. Body: `{ visibility: 'public' | 'private', password?: string }`. Updates `visibility`; on private, hashes and stores `password`. RLS handles the owner check; we don't trust `auth.uid()` from the client.

**`POST /api/boards/[slug]/access`** — body `{ password: string }`. Server fetches `password_hash`, calls `crypt(input, password_hash) = password_hash` to verify, then inserts a `board_members` row with role `'guest'` for the current user. Rate-limit this by IP+user (5 attempts / 5 min) — bcrypt makes brute-force slow but a word dictionary is small.

**Server component `app/b/[slug]/page.tsx`** flow:

1. `getUser()` → if null, redirect to `/?next=/b/<slug>`.
2. Read board. RLS will return the row only if the user is permitted; if `null`, it's either non-existent or private-and-not-a-member.
3. To distinguish, use the **admin client** to peek at `boards.visibility` for this slug:
   - Truly missing → 404.
   - Private + not a member → render a `<PasswordGate slug={slug} />` (client component) instead of `<BoardSurface>`.
4. `<PasswordGate>` posts to `/access`. On success, refresh the route — RLS now lets the board through.

### Owner UI

A small gear button in the board header, visible only when `board.created_by === user.id`, opens a modal:

- Radio: Public / Private.
- Password input (only when Private). Validation: required, single word, ≥3 chars, no spaces. (Match the spec: "a private password is a word.")
- "Save" calls `/settings`. On switch from private → public, server clears `password_hash` and removes all `guest` rows from `board_members`.

### Edge cases worth getting right

- **Owner forgets the password** — they can always change it from the gear menu. No reset flow needed.
- **Toggling private → public** — drops all `guest` rows so a future flip back to private restarts the gate. (If you keep them, anyone who ever entered a password is grandfathered in forever, which is surprising.)
- **Realtime channel auth** — `supabase.channel('board:<id>')` includes the user's JWT. Postgres-changes filtering already respects RLS. Broadcast (cursors, in-progress strokes) does **not** check RLS by default; configure the channel as `private: true` and use Realtime Authorization (Supabase's RLS-on-broadcast) so non-members can't snoop in-progress events. Verify support against the Supabase Realtime version pinned in `package.json`.
- **Owner transfer / multi-owner** — out of scope. Single creator-owner forever.
- **Anonymous link sharing** — explicitly removed by #1. A logged-out visitor following a private board link sees the sign-in screen, then the password gate.

### Done when

- I create a board, flip it to private, set the word `donut`, and share the link with another browser profile.
- The other profile signs in with Google, hits the link, sees a password gate, types `donut`, gets in.
- Without the password, the second profile sees only the gate — and verified in DevTools that the realtime channel for that board returns no events for them.
- Toggling back to public removes all guests; flipping again forces them to re-enter.

---

## Suggested ordering

| Step | Feature | Why this slot |
|---|---|---|
| A | Google auth + middleware + tightened RLS for ownership | Unblocks everything else. |
| B | Populate `created_by` / `updated_by` on every write path | Trivial code change after auth lands; required by both undo and ownership. |
| C | Per-user undo (local stack, hotkey, toasts) | No schema work needed once B is in. Ships independently of #3. |
| D | Visibility + password schema, `board_members` table, owner trigger | DB-only. |
| E | `/settings` and `/access` route handlers + PasswordGate component | Makes D usable. |
| F | RLS rewrite using `can_read_board` / `can_write_board` | Flip the policies last so we don't lock ourselves out mid-development. |
| G | Realtime broadcast authorization (private channel) | Closes the snooping gap on private boards. |

A and B are the same PR. C is its own PR. D–G are one feature, ideally split D+E and F+G.

## Open questions to confirm before building

1. **Sign-in scope** — Google only, or do we also want Apple / GitHub? More providers = more redirect URIs but no architectural change.
2. **Display name source** — Google profile name, or let users edit it on first sign-in? (Affects presence cursors.)
3. **Undo redo** — out of scope here. Add later or skip entirely?
4. **Password reset notification** — when an owner rotates the password, do existing guests stay in (current plan) or get kicked out? Kicking is safer; staying is friendlier. Default: stay in, since the existing sharing trust model already gave them access.
5. **Rate-limit store** — Vercel KV vs. Supabase table for `/access` attempts. KV is faster but adds a vendor.

## Risks specific to this batch

- **Realtime + RLS interplay**: easy to write a policy that works in the SQL editor but silently filters out rows for the realtime client because `auth.uid()` is null in the channel context. Test by opening the board in a private window with no session and confirming postgres_changes deliver nothing.
- **Cross-tab undo confusion**: a user with two tabs on the same board has two independent stacks. Cmd+Z in tab A might revert something they don't see anymore in tab B. Document this; don't try to sync stacks across tabs.
- **Password is "a word"**: no length policy beyond what we enforce. Bcrypt + rate-limiting compensate, but document that short common words are guessable. Don't use this for anything you'd put behind real auth.
- **`getUser()` caching strategy**: must be per-request (`React.cache`), never module-level. A module-level memo would leak one user's identity into another user's RSC render. Code review must catch any `let cachedUser` / module-scoped `Map<string, User>` patterns.
- **Open redirect via `next` param**: validate to same-origin path on every code path that consumes `next` (callback route, sign-out redirect, board-page sign-in bounce). Centralize the check in `lib/auth.ts` — `safeNext(raw: string | null): string` — and use it everywhere instead of inline checks that drift apart.
- **`updated_by` plumbing**: every `update notes` call from `lib/db.ts` must set `updated_by` to the current user, or RLS silently rejects the update. The failure mode is "edits don't save" with no visible error unless the helper surfaces the `42501`. Consider centralizing all `update notes` calls behind one helper that always stamps `updated_by`.
