import * as vscode from "vscode";
import { Agent, Handover, TeamConfig } from "./types.js";

export class FileGenerator {
  /**
   * Generate `.agent.md` content for a single agent, including its handoffs.
   * If the agent has rawContent (from the catalog), use it as-is and only
   * inject handoff frontmatter. Otherwise, build a minimal file.
   */
  generateAgentFile(agent: Agent, handovers: Handover[], allAgents: Agent[]): string {
    const agentHandoffs = handovers.filter((h) => h.fromAgentId === agent.id);

    // If we have the original raw content, use it directly
    if (agent.rawContent) {
      // If there are handoffs to inject, merge them into the frontmatter
      if (agentHandoffs.length > 0) {
        return this.injectHandoffs(agent.rawContent, agentHandoffs, allAgents);
      }
      return agent.rawContent;
    }

    // Fallback: build a minimal agent file
    return this.buildMinimalAgentFile(agent, agentHandoffs, allAgents);
  }

  /**
   * Inject handoff entries into existing .agent.md frontmatter.
   * Preserves the entire original file content.
   */
  private injectHandoffs(
    rawContent: string,
    agentHandoffs: Handover[],
    allAgents: Agent[]
  ): string {
    const handoffYaml = this.buildHandoffYaml(agentHandoffs, allAgents);
    if (!handoffYaml) {
      return rawContent;
    }

    // Try frontmatter at the start of file
    const startMatch = rawContent.match(/^(---\r?\n)([\s\S]*?)(\r?\n---)/);
    if (startMatch) {
      const before = startMatch[1];
      let frontmatterBody = startMatch[2];
      const after = startMatch[3];
      const rest = rawContent.slice(startMatch[0].length);

      // Remove any existing handoffs: block
      frontmatterBody = frontmatterBody.replace(
        /\nhandoffs:[\s\S]*?(?=\n[a-zA-Z]|\n---|\s*$)/,
        ""
      );

      return `${before}${frontmatterBody}\n${handoffYaml}${after}${rest}`;
    }

    // Try frontmatter at the end of file
    const endMatch = rawContent.match(/(\n---\r?\n)([\s\S]*?)(\r?\n---)\s*$/);
    if (endMatch) {
      const beforeFm = rawContent.slice(0, endMatch.index!);
      const fmStart = endMatch[1];
      let frontmatterBody = endMatch[2];
      const fmEnd = endMatch[3];

      frontmatterBody = frontmatterBody.replace(
        /\nhandoffs:[\s\S]*?(?=\n[a-zA-Z]|\n---|\s*$)/,
        ""
      );

      return `${beforeFm}${fmStart}${frontmatterBody}\n${handoffYaml}${fmEnd}\n`;
    }

    // No frontmatter found, prepend one with just handoffs
    return `---\n${handoffYaml}\n---\n\n${rawContent}`;
  }

  private buildHandoffYaml(
    agentHandoffs: Handover[],
    allAgents: Agent[]
  ): string | null {
    const lines: string[] = [];
    for (const h of agentHandoffs) {
      const target = allAgents.find((a) => a.id === h.toAgentId);
      if (!target) continue;
      const targetFilename = slugify(target.name);
      lines.push(`  - label: "Hand off to ${target.name}"`);
      lines.push(`    agent: "${targetFilename}"`);
      if (h.prompt) {
        lines.push(`    prompt: "${escapeYaml(h.prompt)}"`);
      }
    }
    if (lines.length === 0) return null;
    return `handoffs:\n${lines.join("\n")}`;
  }

  private buildMinimalAgentFile(
    agent: Agent,
    agentHandoffs: Handover[],
    allAgents: Agent[]
  ): string {
    const lines: string[] = ["---"];
    lines.push(`description: "${escapeYaml(agent.description)}"`);

    if (agent.tools && agent.tools.length > 0) {
      lines.push(`tools: [${agent.tools.map((t) => `"${t}"`).join(", ")}]`);
    }

    if (agent.model) {
      lines.push(`model: "${agent.model}"`);
    }

    if (agentHandoffs.length > 0) {
      lines.push(this.buildHandoffYaml(agentHandoffs, allAgents) || "");
    }

    lines.push("---");
    lines.push("");
    lines.push(`# ${agent.name}`);
    lines.push("");
    lines.push(agent.description);
    lines.push("");
    return lines.join("\n");
  }

  /**
   * Generate `copilot-instructions.md` orchestrating the full team.
   */
  generateOrchestrationFile(config: TeamConfig): string {
    const { agents, handovers } = config;
    const lines: string[] = [];

    lines.push("# Agent Workflow");
    lines.push("");
    lines.push("This project uses specialized agents managed by dropPod.");
    lines.push("");

    // Team table
    lines.push("## The Team");
    lines.push("");
    lines.push("| Agent | Role |");
    lines.push("|-------|------|");
    for (const agent of agents) {
      lines.push(`| \`@${slugify(agent.name)}\` | ${agent.description.slice(0, 80)} |`);
    }
    lines.push("");

    // Workflow section
    if (handovers.length > 0) {
      lines.push("## Workflow");
      lines.push("");

      // Group handovers by source
      const bySource = new Map<string, Handover[]>();
      for (const h of handovers) {
        const list = bySource.get(h.fromAgentId) || [];
        list.push(h);
        bySource.set(h.fromAgentId, list);
      }

      for (const agent of agents) {
        const agentHandovers = bySource.get(agent.id);
        if (!agentHandovers || agentHandovers.length === 0) continue;

        lines.push(`### ${agent.name}`);
        lines.push("");
        for (const h of agentHandovers) {
          const target = agents.find((a) => a.id === h.toAgentId);
          if (!target) continue;

          if (h.requiresApproval) {
            lines.push(
              `- **Hands off to \`@${slugify(target.name)}\`** (🔒 requires approval)${h.prompt ? `: ${h.prompt}` : ""}`
            );
          } else {
            lines.push(
              `- Hands off to \`@${slugify(target.name)}\`${h.prompt ? `: ${h.prompt}` : ""}`
            );
          }
        }
        lines.push("");
      }

      // Approval rules
      const approvalHandovers = handovers.filter((h) => h.requiresApproval);
      if (approvalHandovers.length > 0) {
        lines.push("## Approval Rules");
        lines.push("");
        for (const h of approvalHandovers) {
          const from = agents.find((a) => a.id === h.fromAgentId);
          const to = agents.find((a) => a.id === h.toAgentId);
          if (!from || !to) continue;
          lines.push(
            `- **${from.name} → ${to.name}**: Output must be reviewed and approved before ${to.name} proceeds.`
          );
        }
        lines.push("");
      }
    }

    return lines.join("\n");
  }

  /**
   * Write all generated files to the workspace.
   */
  async writeFiles(config: TeamConfig): Promise<number> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      throw new Error("No workspace folder open.");
    }

    const root = workspaceFolders[0].uri;
    const agentsDir = vscode.Uri.joinPath(root, ".github", "agents");
    await vscode.workspace.fs.createDirectory(agentsDir);

    let count = 0;

    // Generate agent files (always written)
    for (const agent of config.agents) {
      const content = this.generateAgentFile(
        agent,
        config.handovers,
        config.agents
      );
      const filename = `${slugify(agent.name)}.agent.md`;
      const fileUri = vscode.Uri.joinPath(agentsDir, filename);
      await vscode.workspace.fs.writeFile(
        fileUri,
        Buffer.from(content, "utf-8")
      );
      count++;
    }

    // Generate orchestration file (always, with overwrite check)
    const orchUri = vscode.Uri.joinPath(
      root,
      ".github",
      "copilot-instructions.md"
    );

    let writeInstructions = true;
    try {
      await vscode.workspace.fs.stat(orchUri);
      // File exists — ask user
      const choice = await vscode.window.showWarningMessage(
        "copilot-instructions.md already exists. Overwrite with dropPod team configuration?",
        "Overwrite",
        "Skip"
      );
      if (choice !== "Overwrite") {
        writeInstructions = false;
      }
    } catch {
      // File doesn't exist — write freely
    }

    if (writeInstructions) {
      const orchContent = this.generateOrchestrationFile(config);
      await vscode.workspace.fs.writeFile(
        orchUri,
        Buffer.from(orchContent, "utf-8")
      );
      count++;
    }

    return count;
  }
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function escapeYaml(text: string): string {
  return text.replace(/"/g, '\\"').replace(/\n/g, " ");
}
