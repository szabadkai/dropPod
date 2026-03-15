# dropPod — Agent Team Builder for VS Code

Build a Copilot agent team for your project by browsing 100+ community agents from [github/awesome-copilot](https://github.com/github/awesome-copilot/tree/main/agents), defining handover flows between them, and generating ready‑to‑use `.agent.md` files.

## Features

- **Agent Catalog** — Browse 100+ curated agents from the awesome-copilot `agents/` directory, organized by category (Azure, Testing, .NET, DevOps, Frontend, AI, and more).
- **Team Assembly** — Pick the agents you need and add them to your team. State persists across sessions.
- **Workflow Editor** — Define handover chains between agents with optional approval gates. Drag to reorder. Set handover prompts describing what context to pass along.
- **File Generation** — One click to generate `.agent.md` files and a `copilot-instructions.md` orchestrator into your `.github/agents/` directory.

## Getting Started

### 1. Open the dropPod sidebar

Click the **rocket icon** in the Activity Bar (left sidebar). You'll see two panels:
- **Agent Catalog** — all available agents grouped by category
- **My Team** — your selected agents (empty at first)

### 2. Browse and add agents

Expand categories in the catalog to see agents. Click the **+** button on any agent to add it to your team. Agents already on your team show a ✓ checkmark.

### 3. Define handovers

Click the **workflow icon** (⚡) in the My Team title bar to open the Workflow Editor. Here you can:
- **Drag cards** to reorder your agents
- Click **+ Add Handover** to define a handoff from one agent to another
- Set a **handover prompt** (the context/instructions passed when handing off)
- Toggle the **🔒 Requires Approval** checkbox for gates that need human sign-off

### 4. Generate agent files

Click the **Generate** button (file icon) in the My Team title bar, or use the button in the Workflow Editor. This writes:
- One `.agent.md` file per agent into `.github/agents/`
- A `copilot-instructions.md` orchestrator describing the team workflow

### 5. Use your agents

The generated files work with VS Code Copilot Chat (1.106+). Invoke agents with `@agent-name` in chat. Handoffs defined in frontmatter let agents delegate to each other automatically.

## Commands

| Command | Description |
|---------|-------------|
| `dropPod: Refresh Agent Catalog` | Force-refresh the catalog (bypasses 24h cache) |
| `dropPod: Add to Team` | Add an agent from catalog to your team |
| `dropPod: Remove from Team` | Remove an agent from your team |
| `dropPod: Edit Workflow` | Open the handover/approval flow editor |
| `dropPod: Generate Agent Files` | Write `.agent.md` files to your workspace |

## Requirements

- VS Code 1.106+ (for agent/handoff support)
- Internet connection on first load (catalog is cached for 24 hours)

## Development

```bash
npm install
npm run build
# Press F5 to launch Extension Development Host
```

## License

MIT
