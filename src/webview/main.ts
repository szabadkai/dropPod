import { Agent, Handover, VSCodeAPI } from "./types.js";
import { computeLayout, CARD_WIDTH, CARD_HEIGHT_ESTIMATE } from "./layout.js";
import {
  computeConnectors,
  renderSvgOverlay,
  setupHoverHighlighting,
  renderCard,
  renderDisconnectedSeparator,
} from "./render.js";

declare function acquireVsCodeApi(): VSCodeAPI;

const vscode = acquireVsCodeApi();

let agents: Agent[] = [];
let handovers: Handover[] = [];

const cardsEl = document.getElementById("cards")!;
const svgEl = document.getElementById("svg-overlay")! as unknown as SVGSVGElement;
const generateBtn = document.getElementById("generateBtn")!;

window.addEventListener("message", (e) => {
  const msg = e.data;
  if (msg.type === "update") {
    agents = msg.agents;
    handovers = msg.handovers;
    render();
  }
});

generateBtn.addEventListener("click", () => {
  vscode.postMessage({ type: "generate" });
});

function render(): void {
  cardsEl.innerHTML = "";
  svgEl.innerHTML = "";

  if (agents.length === 0) {
    cardsEl.style.height = "";
    cardsEl.innerHTML = `
      <div class="empty">
        Add agents from the catalog to get started.<br>
        <span style="font-size:11px;opacity:0.6">Flow connections are optional — agents work fine without them.</span>
      </div>
    `;
    return;
  }

  const containerWidth = cardsEl.clientWidth || 600;
  const positioned = computeLayout(agents, handovers, containerWidth);
  const hasConnectedAgents = positioned.some((p) => !p.isDisconnected);

  // Render cards
  let hasDisconnected = false;
  for (const pos of positioned) {
    // Only show separator when there's a DAG above the disconnected zone
    if (pos.isDisconnected && !hasDisconnected && hasConnectedAgents) {
      hasDisconnected = true;
      renderDisconnectedSeparator(cardsEl, pos.y);
    }

    const card = renderCard({
      agent: pos.agent,
      positioned: pos,
      agents,
      handovers,
      onSaveHandovers: saveHandovers,
      onRender: render,
      onReorder: (fromId, toId) => {
        const fromIdx = agents.findIndex((a) => a.id === fromId);
        const toIdx = agents.findIndex((a) => a.id === toId);
        if (fromIdx >= 0 && toIdx >= 0) {
          const [moved] = agents.splice(fromIdx, 1);
          agents.splice(toIdx, 0, moved);
          vscode.postMessage({
            type: "reorder",
            orderedIds: agents.map((a) => a.id),
          });
          render();
        }
      },
    });
    cardsEl.appendChild(card);
  }

  // Size the canvas
  const maxY = positioned.reduce(
    (max, p) => Math.max(max, p.y + CARD_HEIGHT_ESTIMATE),
    0
  );
  const maxX = positioned.reduce(
    (max, p) => Math.max(max, p.x + CARD_WIDTH),
    0
  );
  const canvasHeight = maxY + 24;
  cardsEl.style.height = canvasHeight + "px";

  // SVG connectors
  const connectors = computeConnectors(positioned, handovers);
  renderSvgOverlay(
    svgEl,
    connectors,
    Math.max(containerWidth, maxX),
    canvasHeight
  );

  setupHoverHighlighting(svgEl, cardsEl);
}

function saveHandovers(): void {
  vscode.postMessage({ type: "saveHandovers", handovers });
}
