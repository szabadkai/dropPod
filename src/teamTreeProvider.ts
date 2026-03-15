import * as vscode from "vscode";
import { Agent } from "./types.js";
import { TeamManager } from "./teamManager.js";

export class TeamTreeProvider implements vscode.TreeDataProvider<Agent> {
  private teamManager: TeamManager;

  private readonly _onDidChangeTreeData =
    new vscode.EventEmitter<Agent | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(teamManager: TeamManager) {
    this.teamManager = teamManager;
    teamManager.onDidChange(() => this._onDidChangeTreeData.fire());
  }

  getTreeItem(agent: Agent): vscode.TreeItem {
    const item = new vscode.TreeItem(
      agent.name,
      vscode.TreeItemCollapsibleState.None
    );
    item.description = agent.category;
    item.tooltip = agent.description;
    item.iconPath = new vscode.ThemeIcon("person");
    item.contextValue = "teamAgent";
    return item;
  }

  getChildren(): Agent[] {
    return this.teamManager.getAgents();
  }
}
