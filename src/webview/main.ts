interface VSCodeAPI {
  postMessage(msg: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
}

declare function acquireVsCodeApi(): VSCodeAPI;

interface Agent {
  id: string;
  name: string;
  description: string;
  category: string;
}

interface Handover {
  fromAgentId: string;
  toAgentId: string;
  prompt?: string;
  requiresApproval: boolean;
}

const vscode = acquireVsCodeApi();

let agents: Agent[] = [];
let handovers: Handover[] = [];
let dragSrcId: string | null = null;

const cardsEl = document.getElementById("cards")!;
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

  if (agents.length === 0) {
    cardsEl.innerHTML = `
      <div class="empty">
        Add agents from the catalog to get started.<br>
        <span style="font-size:11px;opacity:0.6">Flow connections are optional — agents work fine without them.</span>
      </div>
    `;
    return;
  }

  agents.forEach((agent, i) => {
    // Straight connector between cards
    if (i > 0) {
      const connector = document.createElement("div");
      connector.className = "connector";
      connector.innerHTML = `
        <div class="connector-line"></div>
        <div class="connector-chevron">&#9660;</div>
        <div class="connector-line"></div>
      `;
      cardsEl.appendChild(connector);
    }

    const card = document.createElement("div");
    card.className = "card";
    card.draggable = true;
    card.dataset.agentId = agent.id;

    card.addEventListener("dragstart", (e) => {
      dragSrcId = agent.id;
      card.classList.add("dragging");
      e.dataTransfer!.effectAllowed = "move";
    });
    card.addEventListener("dragend", () => {
      dragSrcId = null;
      card.classList.remove("dragging");
    });
    card.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer!.dropEffect = "move";
    });
    card.addEventListener("drop", (e) => {
      e.preventDefault();
      if (dragSrcId && dragSrcId !== agent.id) {
        const fromIdx = agents.findIndex((a) => a.id === dragSrcId);
        const toIdx = agents.findIndex((a) => a.id === agent.id);
        if (fromIdx >= 0 && toIdx >= 0) {
          const [moved] = agents.splice(fromIdx, 1);
          agents.splice(toIdx, 0, moved);
          vscode.postMessage({
            type: "reorder",
            orderedIds: agents.map((a) => a.id),
          });
          render();
        }
      }
    });

    // Drag handle
    const dragHandle = document.createElement("div");
    dragHandle.className = "drag-handle";
    dragHandle.textContent = "⠿";
    dragHandle.title = "Drag to reorder";
    dragHandle.setAttribute("aria-hidden", "true");
    card.appendChild(dragHandle);

    // Card body
    const body = document.createElement("div");
    body.className = "card-body";

    // Header: name + category badge
    const header = document.createElement("div");
    header.className = "card-header";

    const name = document.createElement("span");
    name.className = "card-name";
    name.textContent = agent.name;
    header.appendChild(name);

    if (agent.category) {
      const badge = document.createElement("span");
      badge.className = "card-badge";
      badge.textContent = agent.category;
      header.appendChild(badge);
    }
    body.appendChild(header);

    // Description
    if (agent.description) {
      const desc = document.createElement("div");
      desc.className = "card-desc";
      desc.textContent = agent.description.slice(0, 120);
      body.appendChild(desc);
    }

    // Handover section
    const section = document.createElement("div");
    section.className = "handover-section";

    const agentHandovers = handovers.filter((h) => h.fromAgentId === agent.id);

    if (agentHandovers.length > 0) {
      const label = document.createElement("div");
      label.className = "handover-label";
      label.textContent = "Connections";
      section.appendChild(label);

      agentHandovers.forEach((h) => {
        section.appendChild(createHandoverRow(agent.id, h));
      });
    }

    // Add connection button (only when other agents exist)
    const otherAgents = agents.filter((a) => a.id !== agent.id);
    if (otherAgents.length > 0) {
      const addBtn = document.createElement("button");
      addBtn.className = "btn-add-connection";
      addBtn.innerHTML = `<span style="font-size:14px;line-height:1">+</span> Add connection`;
      addBtn.title = "Add a handover connection from this agent";
      addBtn.addEventListener("click", () => {
        handovers.push({
          fromAgentId: agent.id,
          toAgentId: otherAgents[0].id,
          prompt: "",
          requiresApproval: false,
        });
        saveHandovers();
        render();
      });
      section.appendChild(addBtn);
    }

    body.appendChild(section);
    card.appendChild(body);
    cardsEl.appendChild(card);
  });
}

function createHandoverRow(fromId: string, h: Handover): HTMLElement {
  const row = document.createElement("div");
  row.className = "handover-row";

  // Arrow
  const arrow = document.createElement("span");
  arrow.className = "flow-arrow";
  arrow.textContent = "→";
  row.appendChild(arrow);

  // Target agent dropdown
  const select = document.createElement("select");
  select.setAttribute("aria-label", "Target agent");
  agents
    .filter((a) => a.id !== fromId)
    .forEach((a) => {
      const opt = document.createElement("option");
      opt.value = a.id;
      opt.textContent = a.name;
      if (a.id === h.toAgentId) opt.selected = true;
      select.appendChild(opt);
    });
  select.addEventListener("change", () => {
    h.toAgentId = select.value;
    saveHandovers();
    render();
  });
  row.appendChild(select);

  // Separator dot
  const dot = document.createElement("span");
  dot.style.cssText = "color:var(--muted);font-size:11px;flex-shrink:0;opacity:0.5";
  dot.textContent = "·";
  row.appendChild(dot);

  // Optional context input
  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "optional context…";
  input.value = h.prompt || "";
  input.setAttribute("aria-label", "Handover context");
  input.addEventListener("change", () => {
    h.prompt = input.value;
    saveHandovers();
  });
  row.appendChild(input);

  // Approval pill toggle (replaces checkbox)
  const pill = document.createElement("button");
  pill.className = "approval-pill" + (h.requiresApproval ? " active" : "");
  pill.title = h.requiresApproval
    ? "Requires human approval — click to set auto"
    : "Auto handover — click to require approval";
  pill.innerHTML = h.requiresApproval ? "🔒&nbsp;Approval" : "🔓&nbsp;Auto";
  pill.addEventListener("click", () => {
    h.requiresApproval = !h.requiresApproval;
    saveHandovers();
    render();
  });
  row.appendChild(pill);

  // Remove button
  const removeBtn = document.createElement("button");
  removeBtn.className = "btn-remove";
  removeBtn.textContent = "✕";
  removeBtn.title = "Remove connection";
  removeBtn.setAttribute("aria-label", "Remove connection");
  removeBtn.addEventListener("click", () => {
    const idx = handovers.indexOf(h);
    if (idx >= 0) handovers.splice(idx, 1);
    saveHandovers();
    render();
  });
  row.appendChild(removeBtn);

  return row;
}

function saveHandovers(): void {
  vscode.postMessage({ type: "saveHandovers", handovers });
}
