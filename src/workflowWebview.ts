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
      --badge-bg: var(--vscode-badge-background, #4d4d4d);
      --badge-fg: var(--vscode-badge-foreground, #fff);
      --input-bg: var(--vscode-input-background);
      --input-fg: var(--vscode-input-foreground);
      --btn-bg: var(--vscode-button-background);
      --btn-fg: var(--vscode-button-foreground);
      --btn-hover: var(--vscode-button-hoverBackground);
      --error: var(--vscode-errorForeground);
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: var(--vscode-font-family); font-size: var(--vscode-font-size, 13px); color: var(--card-fg); padding: 20px 24px; max-width: 640px; }

    h1 { font-size: 16px; font-weight: 600; margin-bottom: 2px; }
    .subtitle { font-size: 12px; color: var(--muted); margin-bottom: 24px; }

    .empty { color: var(--muted); font-size: 13px; padding: 48px 0; text-align: center; line-height: 1.8; }

    /* Flow container */
    #cards { display: flex; flex-direction: column; align-items: stretch; }

    /* Agent card */
    .card {
      display: flex; align-items: stretch;
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 8px; overflow: hidden;
      transition: border-color 0.12s;
    }
    .card:hover { border-color: var(--accent); }
    .card.dragging { opacity: 0.35; border-style: dashed; }

    /* Drag handle */
    .drag-handle {
      display: flex; align-items: center; justify-content: center;
      padding: 0 10px; width: 36px; flex-shrink: 0;
      color: var(--muted); cursor: grab; font-size: 16px; user-select: none;
      border-right: 1px solid var(--card-border);
      transition: color 0.12s, background 0.12s;
    }
    .drag-handle:hover { color: var(--card-fg); background: var(--vscode-list-hoverBackground, rgba(128,128,128,0.1)); }
    .drag-handle:active { cursor: grabbing; }

    /* Card body */
    .card-body { flex: 1; padding: 12px 16px; min-width: 0; }

    .card-header { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; flex-wrap: wrap; }
    .card-name { font-weight: 600; font-size: 14px; }
    .card-badge {
      font-size: 10px; padding: 2px 8px; border-radius: 10px;
      background: var(--badge-bg); color: var(--badge-fg); white-space: nowrap; letter-spacing: 0.03em;
    }
    .card-desc { font-size: 12px; color: var(--muted); line-height: 1.4; }

    /* Handover section */
    .handover-section { margin-top: 12px; padding-top: 10px; border-top: 1px solid var(--card-border); }
    .handover-label {
      font-size: 10px; font-weight: 600; text-transform: uppercase;
      letter-spacing: 0.07em; color: var(--muted); margin-bottom: 6px;
    }

    /* Handover row */
    .handover-row {
      display: flex; align-items: center; gap: 8px; margin-bottom: 6px;
      padding: 5px 8px; background: var(--input-bg);
      border: 1px solid transparent; border-radius: 6px;
    }
    .handover-row:hover { border-color: var(--card-border); }
    .flow-arrow { font-size: 13px; color: var(--accent); flex-shrink: 0; font-weight: bold; }
    .handover-row select {
      background: transparent; color: var(--input-fg); border: none;
      font-size: 13px; font-family: inherit; padding: 0; outline: none; cursor: pointer; flex-shrink: 0;
    }
    .handover-row input {
      flex: 1; min-width: 60px; background: transparent; color: var(--input-fg);
      border: none; font-size: 12px; font-family: inherit; padding: 0; outline: none;
    }
    .handover-row input::placeholder { color: var(--muted); opacity: 0.6; }

    /* Approval pill */
    .approval-pill {
      display: inline-flex; align-items: center; gap: 4px;
      padding: 2px 8px; border-radius: 10px; cursor: pointer;
      font-size: 11px; font-family: inherit;
      border: 1px solid var(--card-border); background: transparent; color: var(--muted);
      white-space: nowrap; flex-shrink: 0; transition: all 0.12s;
    }
    .approval-pill:hover { border-color: var(--accent); color: var(--card-fg); }
    .approval-pill.active { background: var(--badge-bg); color: var(--badge-fg); border-color: transparent; }

    /* Remove button */
    .btn-remove {
      background: none; border: none; color: var(--muted); cursor: pointer;
      padding: 2px 5px; border-radius: 4px; font-size: 14px; line-height: 1;
      flex-shrink: 0; transition: color 0.12s;
    }
    .btn-remove:hover { color: var(--error); }

    /* Add connection button */
    .btn-add-connection {
      display: inline-flex; align-items: center; gap: 6px;
      background: none; border: 1px dashed var(--card-border); color: var(--muted);
      border-radius: 6px; padding: 4px 12px; font-size: 12px; cursor: pointer;
      margin-top: 6px; font-family: inherit; transition: all 0.12s;
    }
    .btn-add-connection:hover { border-color: var(--accent); color: var(--accent); border-style: solid; }

    /* Straight connector between cards */
    .connector {
      display: flex; flex-direction: column; align-items: center;
      padding: 4px 0; gap: 0;
    }
    .connector-line { width: 2px; height: 14px; background: var(--card-border); }
    .connector-chevron { font-size: 10px; color: var(--muted); line-height: 1; margin: -1px 0; }

    /* Actions */
    .actions { margin-top: 24px; display: flex; align-items: center; gap: 12px; }
    .btn-primary {
      display: inline-flex; align-items: center; gap: 8px;
      background: var(--btn-bg); color: var(--btn-fg);
      border: none; border-radius: 4px; padding: 8px 18px;
      cursor: pointer; font-size: 13px; font-weight: 500; font-family: inherit;
      transition: background 0.12s;
    }
    .btn-primary:hover { background: var(--btn-hover); }
    .actions-hint { font-size: 11px; color: var(--muted); }
  </style>
</head>
<body>
  <h1>Workflow Editor</h1>
  <p class="subtitle">Connections between agents are optional — agents work independently by default.</p>
  <div id="cards"></div>
  <div class="actions">
    <button id="generateBtn" class="btn-primary">&#9654; Generate Agent Files</button>
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
