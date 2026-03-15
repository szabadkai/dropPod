# Activation Rules — Flow Specification

Addendum to `dag-layout-flow.md`. Adds three trigger types to agent cards: **handoff** (existing), **file-pattern**, and **phase**. Position and connector behavior remain topology-driven per the DAG spec; activation rules layer on as card metadata and visual annotations.

---

## 1. Data Model

### ActivationRule

```ts
type TriggerType = "handoff" | "file-pattern" | "phase";
type Phase = "planning" | "implementation" | "review" | "close";

interface ActivationRule {
  agentId: string;
  trigger: TriggerType;
  /** For file-pattern: the glob (e.g. "src/**/*.test.ts"). Unused for handoff/phase. */
  pattern?: string;
  /** For phase: which phase. Unused for handoff/file-pattern. */
  phase?: Phase;
}
```

Handoff triggers are **not stored** as `ActivationRule` objects — they continue to live in the existing `Handover[]` array. The `"handoff"` trigger type exists only as a conceptual label in the UI; the source of truth for handoffs is unchanged. This avoids dual bookkeeping.

Only `file-pattern` and `phase` rules are stored in `ActivationRule[]` alongside the existing `handovers` in `TeamConfig`.

---

## 2. Card Layout — Triggers Section

### Placement

A new **Triggers** section appears between the card description and the existing **Connections** section. It renders only when the agent has at least one file-pattern or phase rule.

```
┌─────────────────────────────────┐
│ ⠿ │  Agent Name   [category]   │
│   │  Short description text...  │
│   │                             │
│   │  TRIGGERS                   │
│   │  ┌─────┐ ┌───────────────┐  │
│   │  │ 📂 src/**/*.test.ts  │  │
│   │  └─────┘ └───────────────┘  │
│   │  ┌──────────────┐           │
│   │  │ ⟳ review     │           │
│   │  └──────────────┘           │
│   │                             │
│   │  CONNECTIONS                │
│   │  → architect  (context...)  │
│   │  [+ Add connection]         │
│   │  [+ Add trigger]            │
└─────────────────────────────────┘
```

### Trigger Tags

Each activation rule renders as a **tag** — a compact inline element styled like a pill/chip.

| Trigger type | Icon | Label | Tag style |
|-------------|------|-------|-----------|
| `file-pattern` | Codicon `$(file-code)` | The glob pattern, truncated at 24 chars | `background: var(--input-bg); border: 1px solid var(--card-border)` |
| `phase` | Codicon `$(symbol-event)` | Phase name (e.g. "review") | Phase-colored left border — see §3 |

Tag dimensions:
- Padding: `2px 8px`
- Border-radius: `10px` (matches existing `.card-badge`)
- Font size: `11px`
- Max-width: `240px` (overflow: ellipsis)
- Gap between tags: `6px`
- Tags wrap horizontally within the card's `280px` width

### Remove Trigger

Each tag has a `×` remove button on its right edge, visible on tag hover. Same pattern as the existing handover remove button (`btn-remove` class).

### Triggers Section Label

`"TRIGGERS"` — same style as the existing `"CONNECTIONS"` label (`handover-label` class: 10px uppercase, muted color, 0.07em letter-spacing).

---

## 3. Phase Visual Language

### Phase Colors

Each phase gets a subtle accent color. These are desaturated to work in both light and dark VS Code themes, using theme-safe token fallbacks.

| Phase | Color token | Fallback |
|-------|-------------|----------|
| planning | `var(--vscode-charts-blue, #4a9cd6)` | Medium blue |
| implementation | `var(--vscode-charts-green, #57a773)` | Medium green |
| review | `var(--vscode-charts-yellow, #d6a44a)` | Amber/gold |
| close | `var(--vscode-charts-purple, #9a6dd7)` | Medium purple |

### Phase Tag Rendering

Phase tags use the phase color as a `3px` left-border accent on the pill (the rest of the pill is standard `var(--input-bg)` background). The phase name text is `var(--card-fg)`.

### Phase Indicators on Cards

When a card has a phase rule, the card also gets a **thin colored top-border stripe** (`2px` height, phase color) at the very top of the card element. This provides at-a-glance phase association when scanning the DAG without needing to read inside the card.

If a card has multiple phase rules, the stripe is split equally (e.g., two phases = two colors, each spanning half the card width). This should be rare but handled gracefully.

---

## 4. Phase Lanes in the DAG

### Design Decision: Decoration, Not Layout

Phase assignment does **not** influence DAG rank. Rank remains topology-driven (longest-path from sources per `dag-layout-flow.md` §1). Phases are a **visual overlay** — background zones behind the DAG.

**Rationale**: Mixing topology-driven rank with phase-driven rank creates irreconcilable conflicts. An agent at rank 3 (by handover depth) tagged "planning" (rank 0 in phase order) cannot be in two places. Keeping layout topology-driven and phase purely visual avoids this.

### Phase Lane Rendering

Phase lanes are **optional horizontal background bands** spanning the full container width, drawn behind the DAG in the SVG layer (below connectors, `z-index: -1`).

A lane appears only when at least one agent in the DAG has that phase assigned.

#### Lane Geometry

- The lane for phase P spans vertically from the **minimum top** of any card with phase P, minus `16px` padding, to the **maximum bottom** of any card with phase P, plus `16px` padding.
- Lanes that overlap vertically (because agents in different phases share the same rank) merge into adjacent bands with no gap. A `1px` dashed divider separates overlapping lanes.
- Horizontal extent: full container width.

#### Lane Visual

- Background: phase color at `0.06` opacity (barely visible, tints the background).
- Left edge: a `3px` solid stripe in the phase color at `0.3` opacity.
- Phase label: left-aligned, vertically centered in the lane, rotated `0°` (horizontal), `10px` uppercase, phase color at `0.5` opacity. Positioned at `8px` from the left edge.

#### No-Phase Agents

Agents without a phase rule get no lane association. They sit in the DAG at their topological rank, with clear/untinted background. This is fine — not every agent needs a phase.

#### Lane Ordering

When phases coexist at the same vertical range, they display left-to-right in workflow order: planning → implementation → review → close. The phase label stacks vertically if multiple lanes overlap at the same vertical position.

---

## 5. File-Pattern Trigger Rendering

### Card-Level Only

File-pattern triggers have no DAG-wide visual representation. They are **card metadata** — shown only in the Triggers section as tags (§2). They don't create connectors, lanes, or any inter-card visual.

**Rationale**: File patterns describe when an agent activates, not how agents relate to each other. They're analogous to a filter or condition, not a flow edge.

### Pattern Display

- Icon: `$(file-code)` codicon (file with code brackets)
- Text: the glob pattern, monospace font (`var(--vscode-editor-font-family)`), truncated at 24 characters with ellipsis
- Full pattern shown in `title` attribute on hover (native browser tooltip)
- Example rendered tag: `📄 src/**/*.test.ts`

---

## 6. Adding Activation Rules

### "Add trigger" Button

A new button appears at the **bottom of the card body**, below the existing "Add connection" button. Styled identically to `btn-add-connection`.

```
[+ Add connection]
[+ Add trigger]
```

Label: `"+ Add trigger"`. Icon: `$(add)` (same as add connection).

### Add Trigger Flow

Clicking "Add trigger" opens a **two-step inline flow** within the card (no modal, no separate panel):

**Step 1 — Trigger type selector**

Three buttons appear inline, replacing the "Add trigger" button temporarily:

```
  Choose trigger:
  [ File pattern ]  [ Phase ]
```

(Handoff is not listed — use "Add connection" for that.)

Buttons are styled as `btn-add-connection` variants, laid out horizontally with `8px` gap. This row appears where "Add trigger" was. An `×` dismiss button at the right lets the user cancel.

**Step 2a — File pattern** (if selected)

The trigger type buttons collapse. An inline text input appears:

```
  📄 [src/**/*.ts________________] [✓] [×]
```

- Input field: `var(--input-bg)` background, `200px` width, placeholder `"glob pattern (e.g. **/*.test.ts)"`.
- `✓` confirm button: creates the rule, collapses the input, re-renders the card with the new tag.
- `×` cancel: collapses back to the "Add trigger" button.
- `Enter` key confirms. `Escape` key cancels.
- **Validation**: empty pattern is rejected (button stays disabled). No regex validation on the glob itself — invalid globs are the user's responsibility (matches VS Code's own `applyTo` behavior).

**Step 2b — Phase** (if selected)

The trigger type buttons collapse. A dropdown appears with the four phases:

```
  ⟳ [planning        ▾] [✓] [×]
```

- Only phases not already assigned to this agent appear in the dropdown (no duplicate phase rules).
- Selecting a phase and confirming creates the rule.
- If all four phases are already assigned, the "Phase" button in Step 1 is disabled (grayed, tooltip: "All phases assigned").

### No Inline Editing

Trigger values are **not editable after creation**. To change a file pattern, remove the tag and add a new one. Phase tags are similarly remove-and-re-add. This avoids the complexity of inline editing for tags.

**Rationale**: File patterns and phase assignments are set-and-forget. Users aren't frequently tweaking them. Remove + re-add is two clicks for a rare operation.

---

## 7. Interaction Between Handoffs and Phase Lanes

### Connectors Cross Lanes

Handoff connectors (SVG Bézier paths from `dag-layout-flow.md` §2) draw on top of phase lanes. No change to connector rendering. The lane's low-opacity background (`0.06`) ensures connectors remain clearly visible.

### Connector Hover Still Works

Card hover dimming and connector highlighting from `dag-layout-flow.md` §2 work unchanged. Phase lanes are background decoration and do not participate in hover interactions.

### No Phase-to-Phase Connectors

Phases are not nodes. There are no edges between phases. The sequential nature of phases (planning → implementation → review → close) is communicated by the vertical top-to-bottom convention of the DAG, not by drawn connectors.

---

## 8. Disconnected Agents with Triggers

### Phase/File-Pattern on Disconnected Agents

An agent can have activation rules (file-pattern, phase) but zero handover connections. Such agents are **still considered disconnected** for DAG layout purposes — they appear in the disconnected zone (`dag-layout-flow.md` §4).

**However**, if phase lanes exist in the main DAG area, disconnected agents with a matching phase get a phase-colored top-border stripe on their card (§3). The disconnected zone itself does not display phase lanes (it would be confusing to have lanes in a zone that is explicitly "not part of the flow").

### Rationale

Disconnected agents with triggers are valid: an agent that activates on `**/*.test.ts` (file-pattern) is useful without any handover connections. Placing them in the disconnected zone is correct because they have no topology — but the trigger tags on their card make their activation conditions visible.

---

## 9. Keyboard & Accessibility

### Trigger Tags

- Tags receive `role="listitem"` within a `role="list"` container (the triggers section).
- Each tag has `aria-label="File pattern trigger: {pattern}"` or `"Phase trigger: {phase}"`.
- The remove `×` button on each tag is a `<button>` with `aria-label="Remove {trigger type} trigger"`.
- `Tab` navigates trigger tags and their remove buttons in DOM order, between the description and the connections section.

### Add Trigger Flow

- The type selector buttons and the input/dropdown in Step 2 follow standard tab order.
- `Escape` from any step cancels back to the "Add trigger" button.
- The file-pattern input auto-focuses on render.
- The phase dropdown auto-focuses on render.

### Screen Reader Announcements

- Adding a trigger: the new tag appears and screen readers announce it via an `aria-live="polite"` region at the card level.
- Removing a trigger: the `aria-live` region announces `"{trigger type} trigger removed"`.

### Phase Lanes

- Phase lane backgrounds are `aria-hidden="true"` (decorative).
- Phase information is conveyed through the card's trigger tags (interactive, labeled elements), not through the background lanes.

---

## 10. Persistence & Message Protocol

### Webview → Extension Messages

New message type:

```ts
{ type: "saveActivationRules", rules: ActivationRule[] }
```

Sent whenever a trigger is added or removed. Contains the **full** activation rules array (same pattern as `saveHandovers`).

### Extension → Webview Messages

The existing `update` message gains a new field:

```ts
{
  type: "update",
  agents: Agent[],
  handovers: Handover[],
  activationRules: ActivationRule[]   // new
}
```

### File Generation Impact

- **`file-pattern` rules** → generate `applyTo` glob in the agent's `.agent.md` frontmatter.
- **`phase` rules** → generate prose rules in `.github/copilot-instructions.md` (e.g., "Invoke @bob during the review phase").
- **`handoff` rules** → existing `handoffs` frontmatter generation (unchanged).

---

## 11. Edge Cases

| Scenario | Behavior |
|----------|----------|
| Agent has only phase triggers, no handoffs | Agent is disconnected (no topology). Phase top-border stripe appears. Triggers section shows phase tag. |
| Agent has only file-pattern triggers, no handoffs | Agent is disconnected. Triggers section shows pattern tag. No phase stripe. |
| Agent has triggers + handoffs | Agent is in DAG. Triggers section and Connections section both visible. |
| Agent has multiple file-pattern triggers | All tags render, wrapping within 280px. No limit on count. |
| Agent has all four phases | All four phase tags render. "Phase" option disabled in "Add trigger" flow. Top-border stripe shows 4 colors. |
| Two agents share the same phase at different ranks | Both get phase stripe. Phase lane background spans both ranks. |
| Phase lane would be very tall (spanning all ranks) | Renders correctly — the lane simply spans the full DAG height. This is valid for a phase like "implementation" that applies to many agents. |
| User removes all triggers from an agent | Triggers section hides. Phase stripe removed. Lane recalculates (may disappear if no other agents in that phase). |
| User removes a handoff, making agent disconnected, but agent has phase trigger | Agent moves to disconnected zone. Phase stripe remains on the card. Lane in main DAG recalculates without this agent. |

---

## 12. Implementation Boundary

### In Scope (Phase 1)

- `ActivationRule` data model and persistence
- Triggers section on cards with file-pattern and phase tags
- "Add trigger" flow (type selector → input/dropdown → confirm)
- Remove trigger via `×` button on tags
- Phase colors and card top-border stripe
- Phase lane background bands in the DAG SVG layer
- Updated message protocol (`saveActivationRules`, extended `update`)
- File generation: `applyTo` from file-pattern, prose rules from phase
- Keyboard navigation and screen reader support for triggers

### Out of Scope (Future)

- Trigger conditions with boolean logic (AND/OR combinations)
- Custom phase names (only the four fixed phases)
- Phase-driven layout (phases influencing rank assignment)
- Trigger validation (linting glob patterns)
- Visual connectors from phase lanes to cards (lanes are background only)
- Trigger templates or presets

---

## Key Success Metric

Users can assign file-pattern and phase activation rules to agents and visually distinguish which agents activate during which phase — without the DAG layout becoming cluttered or the interaction model diverging from the existing connection-editing UX.
