import * as vscode from "vscode";
import { Agent } from "./types.js";
import { TeamManager } from "./teamManager.js";

type CatalogNode = { kind: "category"; label: string } | { kind: "agent"; agent: Agent };

export class CatalogTreeProvider
  implements vscode.TreeDataProvider<CatalogNode>
{
  private agents: Agent[] = [];
  private teamManager: TeamManager;

  private readonly _onDidChangeTreeData =
    new vscode.EventEmitter<CatalogNode | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(teamManager: TeamManager) {
    this.teamManager = teamManager;
    teamManager.onDidChange(() => this._onDidChangeTreeData.fire());
  }

  setAgents(agents: Agent[]): void {
    this.agents = agents;
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: CatalogNode): vscode.TreeItem {
    if (element.kind === "category") {
      const item = new vscode.TreeItem(
        element.label,
        vscode.TreeItemCollapsibleState.Collapsed
      );
      item.iconPath = new vscode.ThemeIcon("folder");
      item.contextValue = "category";
      return item;
    }

    const agent = element.agent;
    const inTeam = this.teamManager.hasAgent(agent.id);
    const item = new vscode.TreeItem(
      agent.name,
      vscode.TreeItemCollapsibleState.None
    );
    item.description = agent.description.slice(0, 80);
    item.tooltip = new vscode.MarkdownString(
      `**${agent.name}**\n\n${agent.description}\n\n*Source:* [${agent.sourceUrl}](${agent.sourceUrl})`
    );
    item.iconPath = new vscode.ThemeIcon(inTeam ? "check" : "person");
    item.contextValue = "agent";
    item.command = {
      command: "droppod.addToTeam",
      title: "Add to Team",
      arguments: [agent],
    };
    return item;
  }

  getChildren(element?: CatalogNode): CatalogNode[] {
    if (!element) {
      // Root: return categories
      const categories = [...new Set(this.agents.map((a) => a.category))];
      categories.sort();
      return categories.map((c) => ({ kind: "category" as const, label: c }));
    }

    if (element.kind === "category") {
      return this.agents
        .filter((a) => a.category === element.label)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((agent) => ({ kind: "agent" as const, agent }));
    }

    return [];
  }
}
