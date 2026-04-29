const state = {
  snapshotUrl: "./latest-dashboard.json",
  refreshMs: 60000,
  timer: null
};

const DESKTOP_NODE_LAYOUT = [
  { key: "brain1", label: "Brain 1", step: "Collect", x: 10, y: 68, copy: "Leads collected from sources." },
  { key: "brain2", label: "Brain 2", step: "Score", x: 28, y: 42, copy: "Lead fit scoring and shortlist filtering." },
  { key: "brain3", label: "Brain 3", step: "Enrich", x: 46, y: 30, copy: "Context and company details added." },
  { key: "brain4", label: "Brain 4", step: "Strategy", x: 64, y: 54, copy: "Outreach and approach planning." },
  { key: "brain5", label: "Brain 5", step: "Review", x: 82, y: 34, copy: "Final review before approval." },
  { key: "approval", label: "Approval", step: "Queue", x: 84, y: 66, copy: "Waiting for human approval." }
];

const MOBILE_NODE_LAYOUT = [
  { key: "brain1", label: "Brain 1", step: "Collect", x: 50, y: 10, copy: "Leads collected from sources." },
  { key: "brain2", label: "Brain 2", step: "Score", x: 50, y: 26, copy: "Lead fit scoring and shortlist filtering." },
  { key: "brain3", label: "Brain 3", step: "Enrich", x: 50, y: 42, copy: "Context and company details added." },
  { key: "brain4", label: "Brain 4", step: "Strategy", x: 50, y: 58, copy: "Outreach and approach planning." },
  { key: "brain5", label: "Brain 5", step: "Review", x: 50, y: 74, copy: "Final review before approval." },
  { key: "approval", label: "Approval", step: "Queue", x: 50, y: 90, copy: "Waiting for human approval." }
];

const summaryGrid = document.getElementById("summary-grid");
const journeyNodes = document.getElementById("journey-nodes");
const journeySvg = document.getElementById("journey-svg");
const lastUpdated = document.getElementById("last-updated");
const statusLight = document.getElementById("status-light");

function safe(value, fallback = "") {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  return text || fallback;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function formatTime(value) {
  if (!value) return "No data";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return safe(value, "No data");
  return date.toLocaleString("en-GB", { dateStyle: "short", timeStyle: "medium" });
}

function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

function countApproval(payload) {
  const leadApprovals = Array.isArray(payload.pending_approvals) ? payload.pending_approvals.length : 0;
  const messageApprovals = Array.isArray(payload.pending_message_approvals) ? payload.pending_message_approvals.length : 0;
  return payload.summary?.waiting_approvals ?? leadApprovals + messageApprovals;
}

function getNodeLayout() {
  return window.matchMedia("(max-width: 760px)").matches ? MOBILE_NODE_LAYOUT : DESKTOP_NODE_LAYOUT;
}

function renderFlowLines(layout, activeKey) {
  while (journeySvg.firstChild) journeySvg.removeChild(journeySvg.firstChild);
  const isMobile = window.matchMedia("(max-width: 760px)").matches;
  journeySvg.setAttribute("viewBox", isMobile ? "0 0 100 100" : "0 0 100 100");

  const glow = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  glow.setAttribute("class", "glow");
  glow.setAttribute("cx", isMobile ? "50" : "54");
  glow.setAttribute("cy", isMobile ? "48" : "46");
  glow.setAttribute("r", isMobile ? "16" : "18");
  journeySvg.appendChild(glow);

  layout.forEach((nodeInfo, index) => {
    if (index === layout.length - 1) return;
    const next = layout[index + 1];
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    const cx1 = (nodeInfo.x + next.x) / 2;
    const cy1 = isMobile ? nodeInfo.y + 5 : nodeInfo.y - 10;
    const cy2 = isMobile ? next.y - 5 : next.y + 10;
    path.setAttribute(
      "d",
      "M " + nodeInfo.x + " " + nodeInfo.y + " C " + cx1 + " " + cy1 + ", " + cx1 + " " + cy2 + ", " + next.x + " " + next.y
    );
    path.setAttribute("class", "flow-line" + (nodeInfo.key === activeKey ? " active" : ""));
    journeySvg.appendChild(path);
  });
}

function stageData(payload) {
  const summary = payload.summary || {};
  return [
    {
      key: "brain1",
      label: "Collected",
      title: "Brain 1 Intake",
      value: summary.collected_total ?? 0,
      text: "Total leads collected by the first brain."
    },
    {
      key: "brain2",
      label: "Scored",
      title: "Brain 2 Scoring",
      value: summary.brain2_scored_total ?? 0,
      text: "Leads that have already been scored."
    },
    {
      key: "brain3",
      label: "Enriched",
      title: "Brain 3 Enrichment",
      value: summary.brain3_enriched_total ?? 0,
      text: "Leads with extra company and context data."
    },
    {
      key: "brain4",
      label: "Strategized",
      title: "Brain 4 Strategy",
      value: summary.brain4_strategized_total ?? 0,
      text: "Leads with outreach direction prepared."
    },
    {
      key: "brain5",
      label: "Reviewed",
      title: "Brain 5 Review",
      value: summary.brain5_reviewed_total ?? 0,
      text: "Leads that passed through final review."
    },
    {
      key: "approval",
      label: "Waiting",
      title: "Pending Approval",
      value: countApproval(payload),
      text: "Leads or messages waiting for approval."
    }
  ];
}

function getActiveKey(payload) {
  const states = Array.isArray(payload.brain_states) ? payload.brain_states : [];
  const running = states.find((item) => item.status === "running");
  if (running) return safe(running.brain, "brain1");

  const queued = states.find((item) => item.status === "queued");
  if (queued) return safe(queued.brain, "brain1");

  if (countApproval(payload) > 0) return "approval";
  return "brain1";
}

function renderJourney(payload) {
  clear(journeyNodes);
  const activeKey = getActiveKey(payload);
  const counts = Object.fromEntries(stageData(payload).map((item) => [item.key, item.value]));
  const layout = getNodeLayout();

  renderFlowLines(layout, activeKey);

  layout.forEach((nodeInfo) => {
    const node = el("article", "node");
    if (nodeInfo.key === activeKey) node.classList.add("active");
    if (nodeInfo.key === "approval" && counts.approval > 0) node.classList.add("waiting");
    node.style.left = nodeInfo.x + "%";
    node.style.top = nodeInfo.y + "%";

    const head = el("div", "node-head");
    const meta = document.createElement("div");
    meta.appendChild(el("div", "node-step", nodeInfo.step));
    meta.appendChild(el("h3", "node-title", nodeInfo.label));
    head.appendChild(meta);
    head.appendChild(el("span", "node-dot"));
    node.appendChild(head);
    node.appendChild(el("div", "node-body", nodeInfo.copy));
    node.appendChild(el("div", "node-count", String(counts[nodeInfo.key] ?? 0)));
    journeyNodes.appendChild(node);
  });
}

function renderSummary(payload) {
  clear(summaryGrid);
  const activeKey = getActiveKey(payload);
  stageData(payload).forEach((item) => {
    const card = el("article", "summary-card" + (item.key === activeKey ? " active" : ""));
    card.appendChild(el("div", "summary-label", item.label));
    card.appendChild(el("div", "summary-value", String(item.value)));
    card.appendChild(el("h3", "", item.title));
    card.appendChild(el("div", "summary-text", item.text));
    summaryGrid.appendChild(card);
  });
}

function updateConnection(ok, generatedAt, errorMessage) {
  lastUpdated.textContent = ok ? formatTime(generatedAt) : safe(errorMessage, "No data");
  statusLight.classList.toggle("connected", ok);
}

async function loadBoard() {
  const url = state.snapshotUrl + "?t=" + Date.now();
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error("HTTP " + response.status);
    const payload = await response.json();
    updateConnection(true, payload.generated_at, "");
    renderJourney(payload);
    renderSummary(payload);
  } catch (error) {
    updateConnection(false, "", safe(error.message, "unknown error"));
  }
}

function schedulePolling() {
  if (state.timer) window.clearInterval(state.timer);
  state.timer = window.setInterval(loadBoard, state.refreshMs);
}

schedulePolling();
loadBoard();
window.addEventListener("resize", loadBoard);
