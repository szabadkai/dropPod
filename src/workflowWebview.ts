import * as vscode from "vscode";
import { TeamManager } from "./teamManager.js";
import { Handover } from "./types.js";

export class WorkflowWebview {
  private panel: vscode.WebviewPanel | undefined;
  private teamManager: TeamManager;
  private extensionUri: vscode.Uri;
  private disposables: vscode.Disposable[] = [];

  constructor(teamManager: TeamManager, extensionUri: vscode.Uri) {
    this.teamManager = teamManager;
    this.extensionUri = extensionUri;
  }

  open(): void {
    if (this.panel) {
      this.panel.reveal();
      this.syncToWebview();
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      "droppod.workflow",
      "dropPod — Workflow Editor",
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(this.extensionUri, "dist"),
        ],
      }
    );

    this.panel.webview.html = this.getHtml(this.panel.webview);

    this.panel.webview.onDidReceiveMessage(
      (msg) => this.handleMessage(msg),
      null,
      this.disposables
    );

    this.panel.onDidDispose(() => {
      this.panel = undefined;
      this.disposables.forEach((d) => d.dispose());
      this.disposables = [];
    });

    const sub = this.teamManager.onDidChange(() => this.syncToWebview());
    this.disposables.push(sub);

    this.syncToWebview();
  }

  private syncToWebview(): void {
    this.panel?.webview.postMessage({
      type: "update",
      agents: this.teamManager.getAgents(),
      handovers: this.teamManager.getHandovers(),
    });
  }

  private handleMessage(msg: { type: string; handovers?: Handover[]; orderedIds?: string[] }): void {
    switch (msg.type) {
      case "saveHandovers":
        if (msg.handovers) {
          this.teamManager.setHandovers(msg.handovers);
        }
        break;
      case "reorder":
        if (msg.orderedIds) {
          this.teamManager.reorderAgents(msg.orderedIds);
        }
        break;
      case "generate":
        vscode.commands.executeCommand("droppod.generateFiles");
        break;
    }
  }

  private getHtml(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "dist", "webview.js")
    );
    const nonce = getNonce();
    return /*html*/ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>dropPod Workflow</title>
  <style>
    :root {
      --card-bg: var(--vscode-editor-background);
      --card-border: var(--vscode-panel-border);
      --card-fg: var(--vscode-editor-foreground);
      --accent: var(--vscode-focusBorder);
      --muted: var(--vscode-descriptionForeground);
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: var(--vscode-font-family); color: var(--card-fg); padding: 16px; }
    h1 { font-size: 18px; margin-bottom: 16px; font-weight: 600; }
    .empty { color: var(--muted); font-style: italic; padding: 32px 0; text-align: center; }
    #cards { display: flex; flex-direction: column; gap: 8px; }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 6px;
      padding: 12px 16px;
      cursor: grab;
    }
    .card:active { cursor: grabbing; }
    .card.dragging { opacity: 0.4; }
    .card-header { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
    .card-name { font-weight: 600; font-size: 14px; }
    .card-desc { font-size: 12px; color: var(--muted); }
    .handover-section { margin-top: 10px; border-top: 1px solid var(--card-border); padding-top: 10px; }
    .handover-row { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; flex-wrap: wrap; }
    .handover-row select, .handover-row input { 
      background: var(--vscode-input-background); 
      color: var(--vscode-input-foreground); 
      border: 1px solid var(--vscode-input-border);
      border-radius: 3px; padding: 3px 6px; font-size: 12px;
    }
    .handover-row input { flex: 1; min-width: 120px; }
    .approval-toggle { display: flex; align-items: center; gap: 4px; font-size: 12px; cursor: pointer; }
    .approval-toggle input { cursor: pointer; }
    .connector { text-align: center; color: var(--muted); font-size: 18px; line-height: 1; padding: 2px 0; }
    .connector.approved { color: var(--accent); }
    button {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none; border-radius: 4px;
      padding: 6px 14px; cursor: pointer; font-size: 13px;
    }
    button:hover { background: var(--vscode-button-hoverBackground); }
    button.secondary {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }
    .add-handover { font-size: 12px; margin-top: 4px; padding: 3px 8px; }
    .remove-btn { background: none; color: var(--muted); padding: 2px 6px; font-size: 14px; min-width: auto; }
    .remove-btn:hover { color: var(--vscode-errorForeground); background: none; }
    .actions { margin-top: 20px; display: flex; gap: 8px; }
  </style>
</head>
<body>
  <h1>🚀 Workflow Editor</h1>
  <div id="cards"></div>
  <div class="actions">
    <button id="generateBtn">Generate Agent Files ▶</button>
  </div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  dispose(): void {
    this.panel?.dispose();
  }
}

function getNonce(): string {
  let text = "";
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return text;
}
