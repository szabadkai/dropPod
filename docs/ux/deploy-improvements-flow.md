# Deploy Improvements — Flow Specification

Covers P0 (always generate copilot-instructions.md), P1 (remove from team), P2 (workflows as optional).

---

## P0: Always Generate copilot-instructions.md

### Current Behavior

`fileGenerator.writeFiles()` only writes `copilot-instructions.md` when `config.handovers.length > 0`. A team with no handovers gets `.agent.md` files but no orchestration file — Copilot doesn't know the agents exist as a team.

### New Behavior

`copilot-instructions.md` is always generated when the team has ≥1 agent. It always contains the team roster table. The workflow/handover section is included only when handovers exist (same as today).

### Overwrite Confirmation Flow

**Trigger**: User clicks "Generate Agent Files" (rocket icon or command palette).

**Step 1 — Check for existing file**

Before writing, check if `.github/copilot-instructions.md` already exists on disk.

- **File does not exist** → write immediately, no dialog. Skip to Step 3.
- **File exists** → proceed to Step 2.

**Step 2 — Confirmation dialog**

Use `vscode.window.showWarningMessage` (warning severity to signal destructiveness):

```
Message:  ".github/copilot-instructions.md already exists. Overwrite with dropPod team configuration?"
Buttons:  [ "Overwrite" ] [ "Cancel" ]
```

- **"Overwrite"** → proceed to write all files. Skip to Step 3.
- **"Cancel" / Esc / dismiss** → abort the entire generate operation. Show no message (standard VS Code cancel = silent).

**Step 3 — Success toast**

Existing message is fine:

```
"Agent team generated! {N} files created in .github/"
```

The count always includes copilot-instructions.md now (N = agents + 1).

### Design Rationale

- **Only ask when the file exists.** First-time users get zero friction. Returning users who already have the file get a safety check.
- **Warning severity, not info.** The yellow icon signals this is a destructive action.
- **No "Merge" or "Diff" option in v0.1.** Keep it simple. A future version could offer merge, but that's scope creep for now.
- **Abort is total.** If the user cancels, no files are written (not even .agent.md files). This avoids a half-deployed state. The user can always re-run.

---

## P1: Remove from My Team

### Current State

`package.json` registers `droppod.removeFromTeam` in `view/item/context` with `group: "inline"`. This means:
- ✅ Inline remove icon appears on hover (the `$(remove)` icon)
- ❌ No right-click context menu entry (inline group is separate from context menu groups)

### Changes Needed

#### 1. Add right-click context menu entry

Add a second menu contribution for the same command with a non-inline group:

```json
{
  "command": "droppod.removeFromTeam",
  "when": "view == droppod.team && viewItem == teamAgent",
  "group": "7_modification"
}
```

This gives users two paths to the same action — hover icon (quick) and right-click (discoverable). Using `7_modification` matches VS Code's convention for destructive item actions.

#### 2. Add "Clear Team" command

Register a new command `droppod.clearTeam`:

```
Command title:  "Clear All Agents"
Category:       "dropPod"
Icon:           $(clear-all)
```

**Context menu placement**: Add to `view/item/context` so it appears in the right-click menu on any team agent:

```json
{
  "command": "droppod.clearTeam",
  "when": "view == droppod.team && viewItem == teamAgent",
  "group": "9_cutcopypaste"
}
```

Also add to the **view title menu** (the `…` overflow), NOT as a navigation icon:

```json
{
  "command": "droppod.clearTeam",
  "when": "view == droppod.team",
  "group": "2_clear"
}
```

This puts it in the overflow menu of the My Team panel. It doesn't deserve a top-level icon — it's destructive and infrequent.

#### 3. Clear Team confirmation

```
Message:  "Remove all {N} agents from your team?"
Buttons:  [ "Remove All" ] [ "Cancel" ]
```

Severity: Warning. On confirm, call `teamManager.clearTeam()` which removes all agents and handovers.

#### Right-click Context Menu — Full Layout

When right-clicking a team agent:

| Group | Item |
|-------|------|
| inline | $(remove) icon (hover only, existing) |
| 7_modification | Remove from Team |
| 9_cutcopypaste | Clear All Agents |

---

## P2: Reframe Workflows as Optional

### Problem

The current My Team title bar has two icons in `navigation` group: Workflow Editor `$(symbol-event)` and Generate `$(file-code)`. Their visual weight is equal, implying both are primary actions. The Workflow Editor is a power-user feature; Generate is the primary action.

### Title Bar Button Order

VS Code renders `navigation` group items left-to-right in the order they appear in `package.json`. Reorder to:

| Position | Command | Icon | Rationale |
|----------|---------|------|-----------|
| 1 (leftmost) | Generate Agent Files | `$(file-code)` | Primary action — always relevant |
| 2 | Edit Workflow | `$(symbol-event)` | Secondary — only for handovers |

Move `droppod.generateFiles` BEFORE `droppod.editWorkflow` in the `view/title` menu declarations. This puts Generate closer to the panel title (more prominent position in VS Code sidebar conventions).

### Workflow Editor — Empty State

When the Workflow Editor opens and the team has no handovers, show:

```
Heading:    "No handovers defined"
Body:       "Handovers let agents pass work to each other automatically.
             Your team will work fine without them — they're optional."
Action:     "Add a handover" button (same as current add behavior)
```

This explicitly reassures users that skipping handovers is normal. The current webview likely shows an empty canvas with no guidance.

### Welcome View for Empty Team

The My Team panel should include a `viewsWelcome` contribution for when the team is empty:

```json
{
  "view": "droppod.team",
  "contents": "Browse the Agent Catalog and add agents to build your team.\n[Browse Catalog](command:droppod.catalog.focus)\n\nOnce you have agents, click $(file-code) to deploy them to your workspace."
}
```

This reinforces the primary flow: **browse → pick → deploy**. No mention of workflows in the empty state.

---

## Accessibility Requirements (WCAG AA)

| Requirement | Implementation |
|-------------|----------------|
| Keyboard nav | All tree items, context menus, and dialog buttons are native VS Code — keyboard accessible by default |
| Screen reader | Dialog messages use plain text, no icon-only labels. Command titles are descriptive. |
| Contrast | All UI uses VS Code theme tokens — inherits user's contrast settings |
| Focus management | After "Clear All", focus returns to My Team panel. After dialog dismiss, focus returns to previous location (VS Code default). |

---

## Key Success Metric

**Primary**: % of generate actions that produce a complete deployment (copilot-instructions.md + all .agent.md files) — target 100%, up from ~0% for teams without handovers.

**Secondary**: Time from first agent added to first generate — should decrease as the workflow editor is no longer perceived as a required step.
