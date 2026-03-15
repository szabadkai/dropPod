import * as vscode from "vscode";
import { CatalogFetcher } from "./catalogFetcher.js";
import { CatalogTreeProvider } from "./catalogTreeProvider.js";
import { TeamTreeProvider } from "./teamTreeProvider.js";
import { TeamManager } from "./teamManager.js";
import { WorkflowWebview } from "./workflowWebview.js";
import { FileGenerator } from "./fileGenerator.js";
import { Agent } from "./types.js";

let output: vscode.OutputChannel;

export function activate(context: vscode.ExtensionContext): void {
  output = vscode.window.createOutputChannel("dropPod");
  output.appendLine("[dropPod] Activating...");

  // Core services
  const teamManager = new TeamManager(context);
  const catalogFetcher = new CatalogFetcher(
    context.globalStorageUri,
    output
  );
  const fileGenerator = new FileGenerator();
  const workflowWebview = new WorkflowWebview(
    teamManager,
    context.extensionUri
  );

  // Tree providers
  const catalogTree = new CatalogTreeProvider(teamManager);
  const teamTree = new TeamTreeProvider(teamManager);

  vscode.window.registerTreeDataProvider("droppod.catalog", catalogTree);
  vscode.window.registerTreeDataProvider("droppod.team", teamTree);

  // Initial catalog load
  loadCatalog(catalogFetcher, catalogTree);

  // Commands
  context.subscriptions.push(
    vscode.commands.registerCommand("droppod.refreshCatalog", () => {
      loadCatalog(catalogFetcher, catalogTree, true);
    }),

    vscode.commands.registerCommand(
      "droppod.addToTeam",
      (agent: Agent) => {
        if (!agent?.id) {
          vscode.window.showWarningMessage("No agent selected.");
          return;
        }
        const added = teamManager.addAgent(agent);
        if (!added) {
          vscode.window.showInformationMessage(
            `${agent.name} is already in your team.`
          );
        }
      }
    ),

    vscode.commands.registerCommand(
      "droppod.removeFromTeam",
      (agent: Agent) => {
        if (!agent?.id) return;
        teamManager.removeAgent(agent.id);
      }
    ),

    vscode.commands.registerCommand("droppod.editWorkflow", () => {
      workflowWebview.open();
    }),

    vscode.commands.registerCommand("droppod.clearTeam", async () => {
      const agents = teamManager.getAgents();
      if (agents.length === 0) {
        return;
      }
      const choice = await vscode.window.showWarningMessage(
        `Remove all ${agents.length} agents from your team?`,
        "Clear All",
        "Cancel"
      );
      if (choice === "Clear All") {
        teamManager.clearTeam();
      }
    }),

    vscode.commands.registerCommand("droppod.generateFiles", async () => {
      const config = teamManager.getConfig();
      if (config.agents.length === 0) {
        vscode.window.showWarningMessage(
          "Add agents to your team first."
        );
        return;
      }

      try {
        const count = await fileGenerator.writeFiles(config);
        vscode.window.showInformationMessage(
          `Agent team generated! ${count} file${count === 1 ? "" : "s"} created in .github/`
        );
      } catch (err) {
        vscode.window.showErrorMessage(
          `Failed to generate files: ${err}`
        );
      }
    }),

    output,
    { dispose: () => workflowWebview.dispose() }
  );

  output.appendLine("[dropPod] Activated.");
}

async function loadCatalog(
  fetcher: CatalogFetcher,
  tree: CatalogTreeProvider,
  force = false
): Promise<void> {
  try {
    const agents = await fetcher.loadAll(force);
    tree.setAgents(agents);
    if (force) {
      vscode.window.showInformationMessage(
        `Agent catalog refreshed: ${agents.length} agents loaded.`
      );
    }
  } catch (err) {
    output.appendLine(`[dropPod] Catalog load failed: ${err}`);
    vscode.window.showErrorMessage(
      "Failed to load agent catalog. Check the Output panel for details."
    );
  }
}

export function deactivate(): void {
  // Cleanup handled by disposables
}
