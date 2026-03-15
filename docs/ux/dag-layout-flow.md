# DAG Layout — Flow Specification

Replaces the linear vertical card stack with a topology-driven DAG layout. Cards and handover editing UX remain unchanged; only the spatial arrangement and connectors change.

---

## 1. Layout Model

### Spatial Model

The layout uses **rank-based rows** (top to bottom), where each rank is a horizontal row of agent cards.

- **Rank 0** (top row): Agents with no incoming edges (source nodes / entry points).
- **Rank N**: Agents whose longest path from any source node is N edges.
- **Disconnected agents**: Placed in a separate zone below the DAG (see §4).

Within each rank, agents are ordered left-to-right. The ordering algorithm minimizes edge crossings using a barycenter heuristic (sort each rank's nodes by the average horizontal position of their connected nodes in the adjacent rank).

### Rank Assignment Algorithm

1. Compute in-degree for each agent that participates in at least one handover.
2. All agents with in-degree 0 → rank 0.
3. BFS forward: for each handover `from → to`, `rank(to) = max(rank(to), rank(from) + 1)`.
4. Agents with no handovers (neither `fromAgentId` nor `toAgentId` in any handover) are **unranked** — they go to the disconnected zone.

### Spacing

| Metric | Value |
|--------|-------|
| Vertical gap between ranks | `48px` (connector space) |
| Horizontal gap between cards in same rank | `24px` |
| Card width | Fixed `280px` (current cards are max-width `640px` in the linear layout; narrower cards enable side-by-side) |
| Disconnected zone top margin | `32px` + a subtle `1px` divider line |

### Container

The `#cards` container switches from `flex-direction: column` to `position: relative` with explicit `left`/`top` positioning for each card. Container height is computed from the layout. Horizontal overflow scrolls if the DAG is wider than the viewport.

---

## 2. Connectors

### Technology

SVG overlay, absolutely positioned behind the cards (`z-index: 0`, cards at `z-index: 1`). A single `<svg>` element spans the full layout area.

### Path Routing

Each connector is an SVG `<path>` drawn as a **vertical cubic Bézier**:

```
M (startX, startY)
C (startX, startY + curveOffset),
  (endX, endY - curveOffset),
  (endX, endY)
```

- **Start point**: Bottom-center of the source card.
- **End point**: Top-center of the target card.
- **`curveOffset`**: `0.5 × vertical distance` between the two points (produces a smooth S-curve for cross-rank, cross-column connections).
- Same-column connections use a straight vertical line (degenerate Bézier where `startX === endX`).

### Arrowheads

Each path ends with a small filled triangle arrowhead (SVG `<marker>` definition, `6×4px`), colored to match the path stroke.

### Visual Encoding

| Attribute | Default | Hover | Approval required |
|-----------|---------|-------|-------------------|
| Stroke color | `var(--card-border)` | `var(--accent)` | `var(--vscode-editorWarning-foreground)` |
| Stroke width | `1.5px` | `2px` | `1.5px` dashed (`4,3`) |
| Opacity | `0.7` | `1` | `0.85` |

### Hover Behavior

- Hovering a card highlights **all connectors originating from or arriving at** that card (stroke → accent, opacity → 1). All other connectors dim to `opacity: 0.25`.
- Hovering a connector path itself highlights it and pulses the source and target cards with an accent border glow.

### Edge Crossing Reduction

The barycenter ordering in §1 handles most crossings. For remaining crossings:
- No additional routing complexity in Phase 1. Bézier curves naturally separate visually even when paths cross, because they curve in opposite directions.
- Crossed paths use a `3px` white (background-colored) stroke-behind trick: each path is drawn twice — first with a thicker background-colored stroke, then the actual colored stroke on top. This creates a visual "bridge" effect at crossings.

---

## 3. Card Adaptations for DAG Layout

### Card Width

Cards shrink from full-width to `280px` fixed width. Internal layout stays the same — just tighter. The description truncates at 80 chars (down from 120) to fit.

### Drag Handle Removal

The drag handle (`⠿` grip) is **removed** from all ranked (connected) cards, because their position is topology-driven. See §5 for what replaces reordering.

Disconnected cards retain the drag handle and support drag-to-reorder within the disconnected zone.

### Card Header Addition: Rank Indicator

No visual rank indicator. The spatial position communicates rank. No change to card header.

---

## 4. Disconnected Agents

### Definition

An agent is **disconnected** if it appears in zero handovers (neither as `fromAgentId` nor `toAgentId`).

### Placement

Below the DAG, after a visual separator:

```
─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─
  Unconnected agents
```

- Dashed `1px` line, `var(--card-border)` color, full container width.
- Small label: "Unconnected agents" in `10px` uppercase, `var(--muted)` color, left-aligned.
- Cards laid out in a horizontal row, wrapping. Same `280px` card width, `24px` gap.

### Visual Distinction

- Cards have a `border-style: dashed` instead of solid, at `0.6` opacity on the border color.
- This communicates "not yet wired up" without being alarming.

### Interaction

- Drag-to-reorder works within the disconnected zone (same as current behavior, scoped to unconnected agents).
- Adding a connection to/from a disconnected agent automatically moves it into the DAG on the next render.
- Removing all connections from a DAG agent moves it to the disconnected zone.

---

## 5. Reordering in a DAG

### Connected Agents: No Manual Reorder

Position is determined by graph topology. Moving a card would mean changing its rank, which means changing the connections — that's a data change, not a cosmetic one. **Drag-to-reorder is disabled for connected agents.**

### Same-Rank Sibling Order

When multiple agents share a rank, their left-to-right order is determined by the edge-crossing minimization algorithm. Users cannot manually reorder siblings within a rank.

**Rationale**: Manual reorder within a rank would fight the auto-layout on every re-render. The algorithm's ordering is optimized for readability. If a user wants agent B to the left of agent C, they can restructure the connections.

### Disconnected Agents: Manual Reorder Preserved

Disconnected agents have no topological constraint. Drag-to-reorder is preserved within the disconnected zone and persists via the existing `reorder` message (only the IDs of disconnected agents are reordered; connected agent order is computed).

---

## 6. Adding Connections

### Existing UX: Preserved

The current "Add connection" button inside each card body, with a dropdown to pick the target agent, continues to work exactly as-is. This is efficient and familiar.

### Enhancement: Visual Feedback on Add

When a new connection is added:
1. The layout re-computes immediately.
2. The newly created connector path animates in with a `0.3s` fade + grow from the source card.
3. If the target agent was previously disconnected, it animates from the disconnected zone to its new rank position (`0.3s` ease-out transform).

### Cycle Prevention

The target dropdown for "Add connection" **filters out agents that would create a cycle**. If agent A can reach agent B through existing connections, then agent B's "Add connection" dropdown must not list agent A.

Implementation: Before rendering the dropdown options, run a reachability check (DFS from the candidate target through existing `toAgentId` edges). If the current card's agent is reachable, exclude that candidate.

**UI for blocked options**: Simply omit them from the dropdown. If all agents are excluded (rare — would mean this agent can reach every other agent), the "Add connection" button is hidden.

---

## 7. Readability at Scale (8–12 Agents)

### Horizontal Scrolling

If a rank has more agents than fit in the viewport width, the container scrolls horizontally. A subtle horizontal scrollbar appears (styled with `--vscode-scrollbarSlider-background`).

### Minimap: Not in Phase 1

At 8–12 agents, a minimap is not necessary. The layout is vertically compact (4 ranks × ~100px card height × ~48px gap = ~600px, well within viewport). Horizontal scroll handles width.

### Max Rank Width Guideline

The layout algorithm does not artificially limit rank width. If 6 agents are in rank 0 (all sources), they spread out. This is correct — it visually communicates "these are all independent entry points."

### Zoom: Not in Phase 1

No zoom controls. Cards use a fixed `280px` width. At 12 agents / 4 ranks, worst case is ~1700px wide, which is scrollable.

---

## 8. Empty / Few-Agent States

### 0 Agents

No change. Current empty state message is preserved:

> Add agents from the catalog to get started.
> *Flow connections are optional — agents work fine without them.*

### 1 Agent

Single card, centered horizontally, at the top of the container. No connectors. No disconnected zone separator. The card uses the same `280px` width. Drag handle is hidden (only one card).

### 2 Agents, No Connections

Both cards appear in the disconnected zone. Because there's no DAG to draw, the separator line and "Unconnected agents" label are **hidden** — showing a separator with nothing above it is confusing. The cards are simply laid out horizontally with drag-to-reorder.

### 2 Agents, 1 Connection

Source card at rank 0 (top), target at rank 1 (below). Single vertical connector between them. No disconnected zone.

### All Agents Connected in a Single Chain

Visually identical to the current linear layout, but with SVG connectors instead of CSS connector divs. Cards are stacked vertically, one per rank, centered.

---

## 9. Visual Hierarchy: Main Path vs. Side Branches

### Longest Path Emphasis

The **longest path** through the DAG (critical path) is emphasized:

- Connector paths on the longest path use `2px` stroke width and full opacity.
- Connector paths on side branches use `1.5px` stroke width and `0.6` opacity.
- Cards on the longest path have a `2px` left border accent stripe (`var(--accent)` color).

### Longest Path Calculation

1. Find all source nodes (in-degree 0 among connected agents).
2. From each source, compute the longest path (by edge count) to any sink (out-degree 0).
3. The globally longest path wins. Ties are broken by left-to-right source order.
4. Mark all edges and nodes on this path as "primary."

### Why This Works

Users typically have a "happy path" — the main agent pipeline — with specialist agents branching off for error handling, review, or optional tasks. The longest path usually is the happy path. The visual weight difference is subtle (not jarring) but enough to guide the eye.

---

## 10. Accessibility

### Keyboard Navigation

- `Tab` moves focus between cards in reading order (rank 0 left-to-right, then rank 1, etc., then disconnected agents).
- Focused card shows `2px` `var(--accent)` outline (`:focus-visible`).
- `Enter` on a focused card expands/activates the handover editing section.
- Within the handover editing section, standard tab order: dropdown → context input → approval pill → remove button.

### Screen Reader Support

- Each card has `role="group"` with `aria-label="Agent: {name}, rank {N}"` (or `"Agent: {name}, unconnected"` for disconnected agents).
- Connectors are decorative (`aria-hidden="true"` on the SVG overlay).
- Connection information is conveyed through the handover rows within each card (already present as interactive elements with labels).

### Contrast

- All strokes, text, and interactive elements use VS Code theme tokens which guarantee WCAG AA compliance in all bundled themes.
- The `0.6` opacity on side-branch connectors against a `--vscode-editor-background` must maintain `3:1` contrast for non-text elements. The implementation should verify this against light themes and fall back to `0.75` opacity if needed.

### Reduced Motion

- All connector animations and card position transitions respect `prefers-reduced-motion: reduce`. When active, transitions are instant (duration `0s`).

### Touch Targets

- Not applicable (VS Code webview is desktop-only). All interactive elements are already accessible via mouse and keyboard.

---

## 11. Transitions and Animation

### Layout Changes

When connections are added/removed and the layout recomputes:

- Cards animate to their new positions: `transition: left 0.3s ease-out, top 0.3s ease-out`.
- SVG connector paths animate via interpolation of the path `d` attribute (using `requestAnimationFrame`-based tweening, not CSS transitions, since SVG path morphing isn't CSS-animatable cross-browser).
- New connectors fade in: `opacity 0→1` over `0.25s`.
- Removed connectors fade out: `opacity 1→0` over `0.2s`, then removed from DOM.

### Reduced Motion Override

All of the above → `duration: 0` when `prefers-reduced-motion: reduce`.

---

## 12. Implementation Boundary

### In Scope (Phase 1)

- Rank-based DAG layout algorithm (longest-path ranking + barycenter ordering)
- SVG connector overlay with Bézier paths and arrowheads
- Disconnected agent zone with dashed-border cards
- Longest-path visual emphasis
- Cycle prevention in "Add connection" dropdown
- Card animation on layout changes
- Connector hover highlighting
- Keyboard navigation order follows rank reading order
- Horizontal scroll for wide DAGs

### Out of Scope (Future Phases)

- Canvas/freeform positioning
- Minimap or zoom controls
- Manual sibling reorder within a rank
- Drag-to-connect (drawing a connector by dragging from one card to another)
- Grouping or clustering agents
- Exporting the graph as an image

---

## Key Success Metric

Users with 4+ agents and branching connections can visually trace the flow from source to sink without confusion. The layout should be self-explanatory — no documentation needed to understand which agent feeds into which.
