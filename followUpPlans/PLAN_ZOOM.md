# IdeaBoard — Zoom Out / Zoom Controls

> **Status: ✅ Done** — implemented in `useBoardStore.ts`, `BoardSurface.tsx`, `StickyNote.tsx`, and the new `ZoomControls.tsx`.

## What's actually wrong today

`BoardSurface.tsx` renders a fixed-size world (`WORLD_W=4000`, `WORLD_H=3000`) inside an `overflow: auto` scroller. There is **no zoom**. You're not "zoomed in" — you're at 100% with no way to ever see the whole board. On a 1440px-wide laptop, you can see roughly the middle third of the board and that's it. Notes placed near the corners are unreachable without panning.

The fix is to add a real zoom state and route every pixel-coord interaction through it.

## Goal

- Trackpad pinch and `Cmd/Ctrl + scroll` zoom around the cursor.
- `Cmd/Ctrl + =` / `Cmd/Ctrl + -` / `Cmd/Ctrl + 0` keyboard shortcuts.
- Zoom controls in the corner: `−`, `+`, percentage readout (clickable to reset to 100%), "Fit" button.
- Pointer drawing, note placement, note dragging, and erasing all respect the current zoom.
- Range: 10% to 400%. Default 100%.
- Per-user, per-tab state. Not stored, not synced.

## Why per-user / not synced

Every collaborator is on a different screen size. Forcing them to share a viewport (Figma "spotlight" / Mural "summon") is a separate feature and never the default. Skip.

## Approach: CSS transform on the world container

The simplest correct approach. One scalar `scale` lives in the store. The world `<div>` gets `transform: scale(s); transform-origin: 0 0;` and an outer wrapper sized `WORLD_W*s × WORLD_H*s` so the scroller's scrollbars stay honest.

```
<div ref={scrollerRef} className="overflow-auto">
  <div style={{ width: WORLD_W * scale, height: WORLD_H * scale }}>
    <div
      ref={worldRef}
      style={{
        width: WORLD_W,
        height: WORLD_H,
        transformOrigin: "0 0",
        transform: `scale(${scale})`,
      }}
    >
      <BoardCanvas /> <NoteLayer />
    </div>
  </div>
</div>
```

Pros: BoardCanvas and StickyNote don't need to know about zoom. Notes' text and shadows scale naturally with the parent transform.

Cons: at zoom > 1, the rasterized canvas backing store gets stretched and looks chunky. Acceptable for v1 — most users zoom *out* to get an overview, not *in* past 100%. A fix is documented under "Future work" below.

### Pointer math has to change

`BoardSurface.getWorldCoords` currently does `e.clientX - rect.left`. With a scaled `worldRef`, `getBoundingClientRect()` returns the **scaled** rect, so the raw delta is in client-pixels — wrong by a factor of `scale`. Update to:

```ts
function getWorldCoords(e: React.PointerEvent<HTMLDivElement>): Point {
  const rect = worldRef.current!.getBoundingClientRect();
  return [(e.clientX - rect.left) / scale, (e.clientY - rect.top) / scale];
}
```

Same correction in `StickyNote.handleHeaderPointerMove`: client deltas (`e.clientX - ds.startX`) are in client pixels but `note.x / note.y` are world pixels. Divide by `scale`:

```ts
const dx = (e.clientX - ds.startX) / scale;
const dy = (e.clientY - ds.startY) / scale;
```

These two changes are the entire correctness story. Miss either and dragging or drawing will drift at non-100% zoom.

### Eraser hit-test

`BoardSurface.eraseAt` uses `threshold = s.width + 8`. The `+ 8` is a screen-pixel-feeling slop. At zoom 0.25, an 8-world-px slop is only 2 client pixels — feels too tight. Change to `threshold = s.width + 8 / scale` so the slop stays roughly constant in screen space.

## Zoom about the cursor (the part everyone gets wrong)

When zoom changes from `s → s'`, the world point under the mouse should stay under the mouse. Implement as:

```ts
function zoomAt(clientX: number, clientY: number, nextScale: number) {
  const scroller = scrollerRef.current!;
  const sRect = scroller.getBoundingClientRect();

  // Mouse position in scroller-local pixels.
  const mx = clientX - sRect.left;
  const my = clientY - sRect.top;

  // World point currently under the mouse.
  const worldX = (scroller.scrollLeft + mx) / scale;
  const worldY = (scroller.scrollTop + my) / scale;

  setScale(nextScale);

  // After scale changes, keep that world point under (mx, my).
  scroller.scrollLeft = worldX * nextScale - mx;
  scroller.scrollTop  = worldY * nextScale - my;
}
```

Order matters: read `scrollLeft/Top` and current `scale` *before* updating React state, then set the scroll positions in a `useLayoutEffect` keyed on `scale`, or queue them with a `requestAnimationFrame` after the DOM commits. Setting `scrollLeft` before the inner box has resized to its new `WORLD_W * nextScale` width will clamp the value.

Cleanest pattern: keep `scale` in Zustand, subscribe to its changes in BoardSurface with a `useLayoutEffect`, and apply the scroll adjustment there using a pending `{ worldX, worldY, mx, my }` ref captured at the call site.

## Inputs

| Input | Behavior |
|---|---|
| `Cmd/Ctrl + wheel` (or trackpad pinch — browsers report it as `wheel + ctrlKey: true`) | Zoom about cursor. `nextScale = scale * exp(-deltaY * 0.0015)` for smooth feel. `e.preventDefault()` so the page doesn't browser-zoom. |
| Plain wheel | Pan the scroller (default behavior, leave it). |
| `Cmd/Ctrl + =` / `Cmd/Ctrl + -` | Step zoom about viewport center: `*1.25` / `/1.25`. |
| `Cmd/Ctrl + 0` | Reset to 100%, recenter on the world center. |
| Toolbar `−` / `+` buttons | Same as keyboard step, anchor at viewport center. |
| Toolbar percentage label | Click → reset to 100%. |
| "Fit" button | See below. |

Bind keyboard shortcuts on the board page only (`useEffect` on the board surface, not on `window` from a global hook). Skip the listener if the active element is a `<textarea>` so typing in a note still works.

The wheel handler attaches to `scrollerRef` with `{ passive: false }` because we call `preventDefault`. React's synthetic `onWheel` is passive by default — use `addEventListener` in a `useEffect`.

## Fit-to-content

Compute the bounding box of all notes (`x, y, x+width, y+height`) and all stroke points. Pad by ~80 world-px. Pick `scale = min(viewportW / bboxW, viewportH / bboxH, 1)` — never zoom past 100% for fit. Center the bbox in the viewport.

Empty board → fit is a no-op (or jump to world center at 100%).

## Where state lives

Add to `useBoardStore`:

```ts
scale: number;            // 0.1 .. 4
setScale: (s: number) => void;  // clamps internally
```

Pan stays as native scroll on `scrollerRef` — don't put `panX/panY` in the store. The DOM is already the source of truth for scroll position, mirroring it into Zustand creates sync bugs and re-renders for every pixel of trackpad pan.

## UI

A small floating widget in the bottom-right of the board area, mirroring how Figma/Miro look:

```
┌──────────────────────────┐
│  −   100%   +    ⤢ Fit  │
└──────────────────────────┘
```

- `−` / `+` step.
- `100%` is a button — click resets to 100%.
- `⤢ Fit` runs fit-to-content.
- Showing 1 decimal under 50% (`12.5%`) avoids "13%, 13%, 13%" with no visible change between steps.

Position it `fixed bottom-4 right-4 z-30` on top of the board, like the existing Toolbar does at the top.

## Performance notes

- The canvas redraws on every store change because `BoardCanvas`'s effect depends on `strokes` and `pendingStroke`. Zoom does **not** change either, so no extra redraws come from this feature. Good.
- Scroll-position writes during cursor-zoom must batch: do them in a single `useLayoutEffect` per scale change. Don't `setScale` inside the wheel handler more than once per animation frame — coalesce wheel events with a `requestAnimationFrame` pump if needed.
- The transformed world is composited on the GPU. CSS transform is fine even with thousands of children. The bottleneck stays the same as today: re-rendering React tree for every move event during note drag.

## Touch and mobile

- Two-finger pinch maps to `wheel + ctrlKey` in WebKit and Chromium-mobile, so the same handler works.
- `touchAction: "none"` is already set on the world div, which kills the browser's own pinch-zoom of the page. Good.
- One-finger pan on touch is already broken on mobile (touch-action none disables it). Out of scope here; add proper touch gesture handling in a separate pass.

## Test plan

1. At 50%, draw a stroke. The line follows the cursor; it doesn't drift.
2. At 200%, drop a note and drag it. The note follows the pointer 1:1 with no lag offset.
3. Pinch in over a specific note. After the zoom, that note is still under the cursor.
4. `Cmd+0` resets and recenters.
5. Two browser windows on the same board with different zoom levels — strokes from one render correctly on the other (world coords are scale-invariant).
6. Eraser at 25% zoom can hit a thin stroke without needing pixel-perfect precision (the `8/scale` slop earned its keep).

## Done when

- A new user opens a brand-new board, hits `Cmd+0`, then `Cmd+-` a few times, and can see the whole 4000×3000 grid in their viewport.
- All four tools work correctly at 25%, 100%, and 200%.
- Realtime collaboration is unchanged (no DB schema, no broadcast changes — zoom is purely client-side).

## Future work (not in this pass)

- **Crisp canvas at high zoom**: re-render `BoardCanvas` at the current scale rather than CSS-stretching it. Allocate the backing store at `min(WORLD_W * scale * dpr, MAX_TEXTURE)` and apply `ctx.scale(scale * dpr, ...)` instead of relying on the CSS transform. Worth it only if users complain about chunky lines past 150%.
- **Tiled rendering** for boards with thousands of strokes — only redraw tiles that intersect the viewport.
- **Minimap** showing the whole world with a viewport rectangle. Useful once boards get genuinely big; overkill for v1.
- **Synced "follow"** where one user can pull others to their viewport. Separate feature from this one.

## Implementation corrections (folded in from review)

The first draft had functional bugs and ambiguities. These are the corrections that landed in the actual code. They override anything earlier in this doc that contradicts them.

### Critical (functional bugs that would have shipped)

1. **`metaKey` vs `ctrlKey`.** Trackpad pinch reports `ctrlKey: true` synthetically on every OS. Mac `Cmd+wheel` is `metaKey`. Win/Linux `Ctrl+wheel` is `ctrlKey`. The handler gates on **`e.ctrlKey || e.metaKey`** for both wheel and keyboard.
2. **No zoom during active drag/draw.** If `pendingStroke` or `draggingNoteId` is non-null, the wheel handler returns early. `StickyNote` also captures `scaleAtStart` into its drag-state ref so a stray scale change can't corrupt the in-flight delta.
3. **No stale closures in non-React listeners.** Wheel and keyboard handlers are attached once with `[]` deps and read live state via `useBoardStore.getState()`. The `zoomAt` callback is held in a ref so the listener never closes over a stale version.
4. **`deltaMode` normalization.** `e.deltaY` is normalized: `DOM_DELTA_LINE` (1) multiplies by 16, `DOM_DELTA_PAGE` (2) multiplies by `scroller.clientHeight`. Without this, line-mode mice barely zoom.
5. **Touchscreen pinch is out of scope.** The "pinch reports as wheel + ctrlKey" claim only holds for trackpad pinch on desktop browsers. iOS/Android touchscreen pinch fires `gesturestart/change/end` (Safari) or requires multi-pointer tracking, neither of which is implemented. Documented as a non-goal here.

### Polish (would have been rough edges)

6. **Keyboard `preventDefault`.** `Cmd/Ctrl + =/-/0` are the browser's own zoom shortcuts; the keyboard handler `preventDefault`s them so we don't double-fire.
7. **Wheel handler only `preventDefault`s when zooming.** Plain wheel (no modifier) falls through to native scroll.
8. **`Cmd+0` reset uses the same pending-scroll-ref pattern** as `zoomAt`, so the recenter happens *after* the inner wrapper has resized.
9. **Re-attach guard.** Wheel listener is attached with empty deps to avoid thrashing on every scale change.
10. **Defensive null check** for `worldRef`/`scrollerRef` in handlers.

### Documented but not implemented

11. **World smaller than viewport at low zoom.** At `scale=0.1` the wrapper is 400×300 and clings to the top-left of the scroller. Centering it requires either grid-place-items-center on the scroller or `margin: auto` on the wrapper, with corresponding adjustments to the cursor-zoom math (the world is no longer at scroller-origin 0,0). Left as-is for now — the zoom-out experience is functional, just not visually centered.
12. **Sub-pixel blur on text at non-integer scales.** Notes' text antialiasing softens at scales like 0.73. Acceptable; users who care can use the stepped buttons (which snap to ×1.25 multiples).
13. **Wheel-while-textarea-focused.** Wheel inside a focused note textarea still triggers the board's wheel handler if `Cmd/Ctrl` is held. That's correct (zoom should win). Without modifier, native textarea scroll handles it.
14. **Realtime cursor presence (Phase 3 of `PLAN.md`)** — when added, broadcast positions in **world coords**; each receiver maps to client coords using its own local `scale`. Not relevant yet; flagged for the implementer.
15. **Crisp canvas at high zoom.** Still future work — see "Future work" below.
16. **Coalescing wheel events** is left to the browser. Modern Chromium and WebKit already throttle wheel events to ~60Hz; an explicit rAF pump is unnecessary at current scale. Revisit if jank appears.

## Out of scope

- Pan via spacebar-drag or middle-mouse. Native scroll is good enough.
- Zoom animation easing. Snap is fine; smooth zoom adds complexity (interrupted gestures, RAF loop) for marginal feel.
- Persisting the user's last zoom across sessions. Refresh = 100% center, like every other tool.
