# IdeaBoard - Mural Clone Implementation Plan

A real-time collaborative whiteboard built with Next.js, React, and Supabase, deployed on Vercel.

## Goals

- Anyone can create a new board with a unique shareable URL.
- Multiple users join the same board and see each other's changes live.
- Tools: freehand pen (multiple colors) and sticky notes (multiple colors, draggable).
- Board state persists so users returning later see the same content.
- Cursor presence so collaborators can see who else is on the board.

## Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 15 (App Router) + React 19 + TypeScript | Vercel-native, server components, easy routing |
| Hosting | Vercel | Required by user |
| Realtime | Supabase Realtime (Broadcast + Presence) | Vercel serverless functions cannot hold long-lived WebSocket connections. Supabase provides hosted Realtime via WebSockets. |
| Persistence | Supabase Postgres | Same vendor as Realtime. Row Level Security for access control. |
| Auth | Anonymous sessions via Supabase Auth (anonymous sign-in) | No signup friction. Each visitor gets a stable user id and color. |
| Canvas rendering | HTML `<canvas>` for ink, absolutely-positioned divs for sticky notes | Canvas is fast for strokes. DOM elements for notes give us textareas, drag handles, and a11y. |
| Styling | Tailwind CSS v4 | Standard for Next on Vercel |
| State on client | Zustand (or React context) for local board state, hydrated from Supabase | Lightweight, avoids prop drilling |
| Drag and drop | dnd-kit or pointer events + transform | dnd-kit handles touch + a11y |

### Why Supabase Realtime instead of raw WebSockets

Vercel functions are short-lived. Hosting a WebSocket server alongside Vercel means a separate persistent service (Railway, Fly, etc.). Supabase Realtime is already a managed WebSocket service tied to the same database we use for storage, which removes a moving part.

Alternatives considered:
- **Liveblocks / PartyKit / Ably**: great DX, but adds a third vendor. Skip for v1.
- **Y.js + y-websocket**: best for true CRDT collaboration, but needs a hosted relay. Worth revisiting if conflicts get painful.

## Data Model (Supabase Postgres)

```sql
-- A board is a single whiteboard surface.
create table boards (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,           -- short URL-friendly id, e.g. 'kf3-xq9'
  name text,
  created_at timestamptz default now(),
  created_by uuid references auth.users(id)
);

-- Sticky notes on a board.
create table notes (
  id uuid primary key default gen_random_uuid(),
  board_id uuid references boards(id) on delete cascade,
  x real not null,
  y real not null,
  width real default 200,
  height real default 200,
  color text not null,                 -- 'yellow', 'pink', 'blue', etc.
  text text default '',
  z_index int default 0,
  updated_at timestamptz default now(),
  updated_by uuid
);

-- Pen strokes on a board. Each stroke is one continuous line.
create table strokes (
  id uuid primary key default gen_random_uuid(),
  board_id uuid references boards(id) on delete cascade,
  color text not null,
  width real default 3,
  points jsonb not null,               -- [[x1,y1],[x2,y2],...]
  created_at timestamptz default now(),
  created_by uuid
);

create index notes_board_id_idx on notes(board_id);
create index strokes_board_id_idx on strokes(board_id);
```

### RLS (Row Level Security)

For v1, any authenticated (including anonymous) user can read/write any board. We can tighten later by tying boards to a creator and adding a "members" table.

```sql
alter table boards enable row level security;
alter table notes  enable row level security;
alter table strokes enable row level security;

create policy "anyone can read boards"  on boards for select using (true);
create policy "anyone can create boards" on boards for insert with check (auth.uid() is not null);
create policy "anyone can read notes"    on notes  for select using (true);
create policy "anyone can write notes"   on notes  for all    using (auth.uid() is not null);
create policy "anyone can read strokes"  on strokes for select using (true);
create policy "anyone can write strokes" on strokes for all    using (auth.uid() is not null);
```

## Realtime Strategy

Two channels per board, joined when the user opens `/b/[slug]`:

1. **Broadcast channel `board:<id>`** for high-frequency ephemeral events:
   - `stroke:point` while a pen is drawing (other clients render the in-progress line).
   - `note:drag` while a sticky note is being dragged (other clients move the ghost position).
   - `cursor:move` cursor positions for presence.

2. **Postgres Changes** subscription on `notes` and `strokes` filtered by `board_id` for durable state:
   - Final stroke insert when pen lifts.
   - Note insert / update / delete (position, color, text).

This split avoids hammering Postgres with every pointer move while still persisting the final result. It is the same pattern Figma, Miro, and Mural use (ephemeral channel for in-progress, durable store for committed state).

### Conflict handling (v1)

- Notes use last-write-wins on `updated_at`. Concurrent edits to the same note text will clobber. Acceptable for v1.
- Strokes are immutable once committed, so no conflict.
- Future: per-note CRDT text (Y.js) if text editing collisions become a real problem.

## Pages and Routes

| Path | Purpose |
|---|---|
| `/` | Landing page. "Create a board" button. Lists recent boards from localStorage so a returning user can find their boards. |
| `/b/[slug]` | The whiteboard surface. |
| `/api/boards` | POST creates a new board, returns `{ slug }`. |

The board page is a client component (`"use client"`) because it owns the canvas, pointer events, and Supabase channel subscriptions.

## Component Layout

```
app/
  layout.tsx
  page.tsx                    # landing
  b/[slug]/page.tsx           # board page (client)
  api/boards/route.ts         # POST create board

components/
  Board/
    BoardCanvas.tsx           # the <canvas> for ink
    NoteLayer.tsx             # absolutely-positioned sticky notes
    StickyNote.tsx
    Toolbar.tsx               # tool select, color picker
    PresenceCursors.tsx       # other users' cursors
    useBoardRealtime.ts       # subscribe to channels, dispatch updates
    useBoardStore.ts          # zustand store for local state

lib/
  supabase/
    client.ts                 # browser client
    server.ts                 # server client (for route handlers)
  slug.ts                     # short URL-friendly id generator

types/
  board.ts                    # Note, Stroke, Cursor, Tool types
```

## Implementation Phases

### Phase 1: Skeleton (no realtime)
1. Scaffold Next.js app with `create-next-app`, Tailwind, TypeScript.
2. Add Supabase client (`@supabase/supabase-js`) and env vars.
3. Create the `boards`, `notes`, `strokes` tables via Supabase SQL editor.
4. Build `/` landing page with "Create board" button that POSTs to `/api/boards`.
5. Build `/b/[slug]` page that fetches existing notes and strokes server-side and renders them statically.

**Done when:** I can create a board, get a URL, refresh the page, and the URL still works (even though it is empty).

### Phase 2: Drawing tools (single-user, persisted)
1. Add `<canvas>` overlay sized to a fixed virtual canvas (e.g. 4000x4000) with pan/zoom.
2. Implement pen tool: pointerdown -> collect points -> pointerup -> insert stroke row in Supabase.
3. Implement sticky note tool: click empty space -> insert note row -> render as draggable div.
4. Drag a note: on pointerup, update note row.
5. Edit note text: textarea in the note, debounced update on blur or 500ms of no typing.
6. Toolbar with tool toggle (pen / note / select) and color picker.

**Done when:** I can draw, place notes, drag notes, edit text, and everything survives a refresh.

### Phase 3: Realtime
1. On board mount, anonymous-sign-in via Supabase Auth so we have a `user_id`.
2. Subscribe to `postgres_changes` on `notes` and `strokes` filtered by `board_id`. On insert/update/delete, mutate local Zustand store.
3. Open Broadcast channel `board:<id>`. While drawing or dragging, broadcast intermediate events. Render incoming events from other users.
4. Add Presence on the same channel: each client tracks `{ user_id, color, name, cursor: { x, y } }`. Render cursors of other users.
5. Optimistic local updates: render my stroke immediately, then let the postgres_changes echo confirm it (dedupe by id).

**Done when:** Two browser windows on the same board show each other's strokes, notes, drags, and cursors live.

### Phase 4: Polish
- Pan/zoom with trackpad and pinch.
- Undo/redo (local only for v1, undoes the last action this user took).
- Eraser tool (deletes the stroke or note under the pointer).
- Keyboard shortcuts (P pen, N note, V select, 1-6 colors).
- "Copy share link" button.
- Recent boards in localStorage on the landing page.
- Loading and empty states.

### Phase 5: Deploy
1. Push to GitHub.
2. Connect repo to Vercel.
3. Add env vars in Vercel: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (for the `POST /api/boards` route).
4. Verify Realtime works in production (Supabase Realtime is enabled by default on free tier, but tables need it toggled on per-table in the dashboard).

## Open Questions / Risks

- **Performance with thousands of strokes**: rendering every stroke as a DOM element or re-running canvas draw on every state change will get slow. Mitigation: keep strokes in a ref'd offscreen canvas that we redraw only when the stroke list changes, and overlay only the in-progress stroke on a top canvas.
- **Realtime fan-out limits**: Supabase free tier has concurrent connection caps. Fine for demos. Document the limit.
- **Anonymous auth abuse**: anyone can spam create boards. Add a simple rate limit on `/api/boards` (e.g. via `@vercel/kv` or Supabase Edge Function) before going public.
- **Mobile**: pointer events work, but the toolbar UX needs design love. Out of scope for v1.

## Estimate

Rough effort for a single engineer working in focused sessions:

| Phase | Time |
|---|---|
| 1 - Skeleton | half day |
| 2 - Drawing tools | 1 to 2 days |
| 3 - Realtime | 1 day |
| 4 - Polish | 1 day |
| 5 - Deploy | a couple hours |

**Total: roughly a week of focused work for a v1.**

## Out of Scope for v1

- Multiple boards per user dashboard.
- Permissions / private boards / invite-only.
- Image upload to the canvas.
- Shapes (rectangles, arrows, connectors).
- Comment threads on notes.
- Export to PNG / PDF.
- Real text CRDT for sticky notes.
- Full undo across all users.
