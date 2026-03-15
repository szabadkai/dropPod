import * as vscode from "vscode";
import { Agent, Handover, TeamConfig } from "./types.js";

export class TeamManager {
  private config: TeamConfig = { agents: [], handovers: [] };
  private context: vscode.ExtensionContext;

  private readonly _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChange = this._onDidChange.event;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.load();
  }

  getConfig(): TeamConfig {
    return this.config;
  }

  getAgents(): Agent[] {
    return this.config.agents;
  }

  getHandovers(): Handover[] {
    return this.config.handovers;
  }

  hasAgent(agentId: string): boolean {
    return this.config.agents.some((a) => a.id === agentId);
  }

  addAgent(agent: Agent): boolean {
    if (this.hasAgent(agent.id)) {
      return false;
    }
    this.config.agents.push({ ...agent });
    this.save();
    this._onDidChange.fire();
    return true;
  }

  removeAgent(agentId: string): void {
    this.config.agents = this.config.agents.filter((a) => a.id !== agentId);
    this.config.handovers = this.config.handovers.filter(
      (h) => h.fromAgentId !== agentId && h.toAgentId !== agentId
    );
    this.save();
    this._onDidChange.fire();
  }

  setHandovers(handovers: Handover[]): void {
    this.config.handovers = handovers;
    this.save();
    this._onDidChange.fire();
  }

  reorderAgents(orderedIds: string[]): void {
    const byId = new Map(this.config.agents.map((a) => [a.id, a]));
    this.config.agents = orderedIds
      .map((id) => byId.get(id))
      .filter((a): a is Agent => a !== undefined);
    this.save();
    this._onDidChange.fire();
  }

  clearTeam(): void {
    this.config = { agents: [], handovers: [] };
    this.save();
    this._onDidChange.fire();
  }

  private load(): void {
    const raw = this.context.workspaceState.get<string>("droppod.team");
    if (raw) {
      try {
        this.config = JSON.parse(raw);
      } catch {
        this.config = { agents: [], handovers: [] };
      }
    }
  }

  private save(): void {
    this.context.workspaceState.update(
      "droppod.team",
      JSON.stringify(this.config)
    );
  }
}
