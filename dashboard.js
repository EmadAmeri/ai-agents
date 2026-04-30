const state = {
  snapshotUrl: "./latest-dashboard.json",
  refreshMs: 60000,
  timer: null,
  animationFrame: 0,
  payload: null,
  dots: []
};

const DESKTOP_LAYOUT = [
  { key: "inbound", x: 10, y: 52 },
  { key: "scoring", x: 30, y: 30 },
  { key: "enrichment", x: 52, y: 50 },
  { key: "pending", x: 74, y: 34 },
  { key: "marketing", x: 90, y: 54 }
];

const MOBILE_LAYOUT = [
  { key: "inbound", x: 50, y: 12 },
  { key: "scoring", x: 50, y: 30 },
  { key: "enrichment", x: 50, y: 48 },
  { key: "pending", x: 50, y: 66 },
  { key: "marketing", x: 50, y: 84 }
];

const connectionState = document.getElementById("connection-state");
const lastUpdated = document.getElementById("last-updated");
const currentFocus = document.getElementById("current-focus");
const journeyDescription = document.getElementById("journey-description");
const journeyNote = document.getElementById("journey-note");
const summaryGrid = document.getElementById("summary-grid");
const feedList = document.getElementById("feed-list");
const journeyNodes = document.getElementById("journey-nodes");
const journeyDots = document.getElementById("journey-dots");
const journeySvg = document.getElementById("journey-svg");
const popup = document.getElementById("lead-popup");
const popupTitle = document.getElementById("popup-title");
const popupBody = document.getElementById("popup-body");
const popupClose = document.getElementById("popup-close");

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

function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

function formatTime(value) {
  if (!value) return "No data";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return safe(value, "No data");
  return date.toLocaleString("en-GB", { dateStyle: "short", timeStyle: "medium" });
}

function getLayout() {
  return window.matchMedia("(max-width: 760px)").matches ? MOBILE_LAYOUT : DESKTOP_LAYOUT;
}

function compactLine(parts) {
  return parts.filter(Boolean).join(" • ");
}

function stageMap(payload) {
  const journey = payload && payload.journey_map ? payload.journey_map : {};
  const stages = Array.isArray(journey.stages) ? journey.stages : [];
  const result = {};
  stages.forEach((item) => {
    result[item.key] = item;
  });
  return result;
}

function nodeColor(key, stageInfo) {
  return stageInfo && stageInfo.color ? stageInfo.color : "#42c6ff";
}

function renderSummary(payload) {
  clear(summaryGrid);
  const journey = payload && payload.journey_map ? payload.journey_map : {};
  const stages = Array.isArray(journey.stages) ? journey.stages : [];
  if (!stages.length) {
    summaryGrid.appendChild(el("div", "empty", "No stage data yet."));
    return;
  }
  stages.forEach((stage) => {
    const card = el("article", "metric-card");
    card.style.borderColor = stage.color ? stage.color + "33" : "";
    card.style.background = stage.color ? stage.color + "12" : "";
    card.appendChild(el("div", "metric-label", safe(stage.label)));
    card.appendChild(el("div", "metric-value", String(stage.count || 0)));
    card.appendChild(el("div", "muted", safe(stage.subtitle, "")));
    summaryGrid.appendChild(card);
  });
}

function renderFeed(payload) {
  clear(feedList);
  const journey = payload && payload.journey_map ? payload.journey_map : {};
  const items = Array.isArray(journey.live_feed) ? journey.live_feed : [];
  if (!items.length) {
    feedList.appendChild(el("div", "empty", "No recent actions reported."));
    return;
  }
  items.forEach((item) => {
    const row = el("article", "feed-item");
    row.appendChild(el("div", "feed-time", formatTime(item.created_at)));
    row.appendChild(el("div", "feed-copy", safe(item.detail, "No detail")));
    row.appendChild(el("div", "feed-meta", compactLine([safe(item.project_name, ""), safe(item.company_name, ""), safe(item.action, "")])));
    feedList.appendChild(row);
  });
}

function cubicPoint(p0, p1, p2, p3, t) {
  const omt = 1 - t;
  const omt2 = omt * omt;
  const omt3 = omt2 * omt;
  const t2 = t * t;
  const t3 = t2 * t;
  return {
    x: omt3 * p0.x + 3 * omt2 * t * p1.x + 3 * omt * t2 * p2.x + t3 * p3.x,
    y: omt3 * p0.y + 3 * omt2 * t * p1.y + 3 * omt * t2 * p2.y + t3 * p3.y
  };
}

function findLayoutItem(layout, key) {
  return layout.find((item) => item.key === key);
}

function curveFor(layout, fromKey, toKey) {
  const from = findLayoutItem(layout, fromKey);
  const to = findLayoutItem(layout, toKey);
  if (!from || !to) return null;
  const mobile = layout === MOBILE_LAYOUT;
  const dx = mobile ? 0 : Math.abs(to.x - from.x) * 0.34;
  const dy = mobile ? Math.abs(to.y - from.y) * 0.24 : 0;
  return {
    from,
    to,
    c1: { x: mobile ? from.x : from.x + dx, y: mobile ? from.y + dy : from.y },
    c2: { x: mobile ? to.x : to.x - dx, y: mobile ? to.y - dy : to.y }
  };
}

function renderPaths(payload, layout) {
  clear(journeySvg);
  const journey = payload && payload.journey_map ? payload.journey_map : {};
  const active = safe(journey.active_transition, "");
  const transitions = [
    ["inbound", "scoring", "inbound_to_scoring"],
    ["scoring", "enrichment", "scoring_to_enrichment"],
    ["enrichment", "pending", "enrichment_to_pending"],
    ["pending", "marketing", "pending_to_marketing"]
  ];
  transitions.forEach(([fromKey, toKey, transitionKey]) => {
    const curve = curveFor(layout, fromKey, toKey);
    if (!curve) return;
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute(
      "d",
      "M " + curve.from.x + " " + curve.from.y +
      " C " + curve.c1.x + " " + curve.c1.y + ", " + curve.c2.x + " " + curve.c2.y + ", " + curve.to.x + " " + curve.to.y
    );
    path.setAttribute("class", "flow-path" + (active === transitionKey ? " active" : ""));
    journeySvg.appendChild(path);
  });
}

function renderNodes(payload, layout) {
  clear(journeyNodes);
  const journey = payload && payload.journey_map ? payload.journey_map : {};
  const stages = stageMap(payload);
  const activeTransition = safe(journey.active_transition, "");
  layout.forEach((item) => {
    const stage = stages[item.key] || { label: item.key, subtitle: "", count: 0, color: "#42c6ff" };
    const active = activeTransition.startsWith(item.key + "_to_") || activeTransition.endsWith("_to_" + item.key);
    const node = el("article", "stage-node" + (active ? " active" : ""));
    node.style.left = item.x + "%";
    node.style.top = item.y + "%";
    const head = el("div", "stage-meta");
    const meta = document.createElement("div");
    meta.appendChild(el("div", "stage-label", safe(stage.subtitle, "")));
    meta.appendChild(el("h3", "stage-title", safe(stage.label, item.key)));
    head.appendChild(meta);
    const pill = el("span", "stage-pill");
    pill.style.background = nodeColor(item.key, stage);
    head.appendChild(pill);
    node.appendChild(head);
    node.appendChild(el("div", "stage-subtitle", safe(stage.subtitle, "")));
    const count = el("div", "stage-count", String(stage.count || 0));
    count.style.color = nodeColor(item.key, stage);
    node.appendChild(count);
    journeyNodes.appendChild(node);
  });
}

function popupLines(dot) {
  return [
    ["Lead", safe(dot.contact_name, "Unknown")],
    ["Company", safe(dot.company_name, "Unknown")],
    ["LinkedIn", safe(dot.linkedin_url, "Not mapped")],
    ["Score", dot.score ? String(dot.score) : "0"],
    ["Stage", safe(dot.stage, "") + (dot.next_stage ? " → " + safe(dot.next_stage, "") : "")],
    ["Fit", safe(dot.fit_label, "Unknown")]
  ];
}

function showPopup(dot) {
  popupTitle.textContent = safe(dot.company_name, "Lead");
  clear(popupBody);
  popupLines(dot).forEach(([label, value]) => {
    const row = el("div", "", "");
    row.innerHTML = "<strong>" + label + ":</strong> " + value;
    popupBody.appendChild(row);
  });
  popup.hidden = false;
}

function hidePopup() {
  popup.hidden = true;
}

function hashSeed(value) {
  const text = String(value || "");
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) hash = ((hash << 5) - hash) + text.charCodeAt(i);
  return Math.abs(hash);
}

function buildDots(payload) {
  const journey = payload && payload.journey_map ? payload.journey_map : {};
  const dots = Array.isArray(journey.dots) ? journey.dots : [];
  state.dots = dots.map((dot) => ({
    ...dot,
    seed: hashSeed(dot.lead_id || dot.company_name || Math.random())
  }));
}

function dotPosition(dot, layout, timeMs) {
  const current = findLayoutItem(layout, dot.stage);
  const next = dot.next_stage ? findLayoutItem(layout, dot.next_stage) : null;
  const cycle = 5200 + (dot.seed % 1700);
  const phase = ((timeMs + dot.seed) % cycle) / cycle;
  if (dot.status === "moving" || dot.status === "processing") {
    if (current && next) {
      const curve = curveFor(layout, dot.stage, dot.next_stage);
      const eased = 0.08 + phase * 0.84;
      return cubicPoint(curve.from, curve.c1, curve.c2, curve.to, eased);
    }
  }
  if (current) {
    const radius = dot.status === "waiting" ? 2.8 : dot.status === "complete" ? 2.2 : 3.4;
    const angle = (phase * Math.PI * 2) + (dot.seed % 360);
    return {
      x: current.x + Math.cos(angle) * radius,
      y: current.y + Math.sin(angle) * radius
    };
  }
  return { x: 50, y: 50 };
}

function renderDotElements() {
  clear(journeyDots);
  state.dots.forEach((dot) => {
    const button = el("button", "dot " + safe(dot.status, "moving"));
    button.type = "button";
    button.title = safe(dot.company_name, "Lead");
    button.style.color = safe(dot.color, "#42c6ff");
    button.addEventListener("click", () => showPopup(dot));
    journeyDots.appendChild(button);
    dot.node = button;
  });
}

function animateDots() {
  cancelAnimationFrame(state.animationFrame);
  const layout = getLayout();
  function frame(now) {
    state.dots.forEach((dot) => {
      if (!dot.node) return;
      const point = dotPosition(dot, layout, now);
      dot.node.style.left = point.x + "%";
      dot.node.style.top = point.y + "%";
    });
    state.animationFrame = requestAnimationFrame(frame);
  }
  state.animationFrame = requestAnimationFrame(frame);
}

function renderTop(payload) {
  const journey = payload && payload.journey_map ? payload.journey_map : {};
  const active = safe(journey.active_transition, "waiting");
  currentFocus.textContent = active.replaceAll("_", " ");
  journeyDescription.textContent =
    "Project: " + safe(journey.project_name, "All projects") +
    ". Colored pulses reflect real lead state from the published snapshot and backend logs.";
  const nextWork = payload.next_work || null;
  journeyNote.textContent = nextWork
    ? compactLine([safe(nextWork.action, ""), safe(nextWork.project_name, ""), nextWork.lead_id ? "lead #" + nextWork.lead_id : "", safe(nextWork.reason, "")])
    : "No queued task reported by the backend.";
}

function updateConnection(ok, generatedAt, errorMessage) {
  connectionState.textContent = ok ? "Snapshot connected" : "Snapshot unavailable";
  lastUpdated.textContent = ok ? formatTime(generatedAt) : safe(errorMessage, "No data");
}

function renderBoard(payload) {
  state.payload = payload;
  const layout = getLayout();
  renderTop(payload);
  renderSummary(payload);
  renderFeed(payload);
  renderPaths(payload, layout);
  renderNodes(payload, layout);
  buildDots(payload);
  renderDotElements();
  animateDots();
}

async function loadBoard() {
  const url = state.snapshotUrl + "?t=" + Date.now();
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error("HTTP " + response.status);
    const payload = await response.json();
    updateConnection(true, payload.generated_at, "");
    renderBoard(payload);
  } catch (error) {
    updateConnection(false, "", error.message || "Unable to load snapshot");
  }
}

popupClose.addEventListener("click", hidePopup);
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") hidePopup();
});
window.addEventListener("resize", () => {
  if (state.payload) renderBoard(state.payload);
});

loadBoard();
state.timer = setInterval(loadBoard, state.refreshMs);
