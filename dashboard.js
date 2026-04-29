const state = {
  backendUrl: localStorage.getItem("ai_agents_backend_url") || new URLSearchParams(location.search).get("backend") || "http://127.0.0.1:8787",
  projectId: localStorage.getItem("ai_agents_project_id") || new URLSearchParams(location.search).get("project_id") || "",
  refreshMs: Number(localStorage.getItem("ai_agents_refresh_ms") || "10000"),
  timer: null
};

const BRAIN_FLOW = ["brain1", "brain2", "brain3", "brain4", "brain5", "finalize"];
const NODE_POSITIONS = [
  { x: 0.5, y: 0.5 },
  { x: 0.24, y: 0.24 },
  { x: 0.76, y: 0.24 },
  { x: 0.18, y: 0.74 },
  { x: 0.82, y: 0.74 },
  { x: 0.5, y: 0.14 }
];

const metricsEl = document.getElementById("metrics");
const projectListEl = document.getElementById("project-list");
const activityEl = document.getElementById("activity-feed");
const brainGridEl = document.getElementById("brain-grid");
const meshSvgEl = document.getElementById("mesh-svg");
const laneGridEl = document.getElementById("lane-grid");
const connectionState = document.getElementById("connection-state");
const lastUpdated = document.getElementById("last-updated");
const liveDot = document.getElementById("live-dot");
const connectionChip = document.getElementById("connection-chip");
const nextWorkChip = document.getElementById("next-work-chip");

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

function emptyState(message) {
  return el("div", "empty", message);
}

function compactLine(parts) {
  return parts.filter((value) => String(value || "").trim()).join(" • ");
}

function normalizeUrl(value) {
  return safe(value).replace(/\/+$/, "");
}

function formatTime(value) {
  if (!value) return "n/a";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return safe(value, "n/a");
  return date.toLocaleString("en-GB", { dateStyle: "short", timeStyle: "medium" });
}

function updateConnection(ok, message, generatedAt) {
  connectionState.textContent = message;
  lastUpdated.textContent = generatedAt ? formatTime(generatedAt) : "No data";
  liveDot.className = ok ? "dot live" : "dot";
  connectionChip.textContent = ok ? "Backend connected" : "Backend disconnected";
}

function renderMetrics(summary = {}) {
  const items = [
    ["Collected", summary.collected_total ?? 0, "Raw leads gathered"],
    ["Brain 2", summary.brain2_scored_total ?? 0, "Leads scored for fit"],
    ["Brain 3", summary.brain3_enriched_total ?? 0, "Leads enriched with context"],
    ["Brain 4", summary.brain4_strategized_total ?? 0, "Outreach strategies prepared"],
    ["Brain 5", summary.brain5_reviewed_total ?? 0, "Final review completed"],
    ["Final", summary.drafted_total ?? summary.approved_total ?? 0, "Drafted or approved outputs"]
  ];
  metricsEl.replaceChildren(...items.map(([label, value, meta]) => {
    const card = el("article", "metric");
    card.appendChild(el("div", "metric-label", label));
    card.appendChild(el("div", "metric-value", String(value)));
    card.appendChild(el("div", "metric-meta", meta));
    return card;
  }));
}

function renderProjects(payload) {
  clear(projectListEl);
  const projects = payload.projects || [];
  const selected = payload.selected_project || null;
  document.getElementById("selected-project-summary").textContent = selected
    ? compactLine([selected.name, "raw " + (selected.raw_leads ?? 0), "drafted " + (selected.drafted_leads ?? 0)])
    : "Auto project selection";

  projects.forEach((project) => {
    const button = el("button", "project-chip" + (selected && project.id === selected.id ? " active" : ""));
    button.type = "button";
    button.addEventListener("click", () => {
      state.projectId = String(project.id);
      localStorage.setItem("ai_agents_project_id", state.projectId);
      loadLiveBoard();
    });
    button.appendChild(el("div", "project-name", safe(project.name)));
    button.appendChild(el("div", "muted", compactLine([
      "status " + safe(project.status),
      "raw " + (project.raw_leads ?? 0),
      "shortlist " + (project.shortlisted_leads ?? 0)
    ])));
    button.appendChild(el("div", "muted", compactLine([
      "enrich " + (project.awaiting_enrichment_leads ?? 0),
      "strategy " + (project.awaiting_strategy_leads ?? 0),
      "approval " + (project.pending_approval_requests ?? 0)
    ])));
    projectListEl.appendChild(button);
  });

  if (!projects.length) {
    projectListEl.appendChild(emptyState("No projects yet."));
  }
}

function renderCompactLead(item, variant) {
  const card = el("article", "compact-card");
  const head = el("div", "compact-head");
  head.appendChild(el("h3", "compact-title", safe(item.company_name, "Unknown")));
  head.appendChild(el("div", "compact-meta", safe(
    item.collected_at || item.scored_at || item.completed_at || item.draft_created_at || item.city,
    ""
  )));
  card.appendChild(head);
  card.appendChild(el("div", "compact-copy", compactLine([
    item.city || item.location,
    item.fit_classification || item.fit_label,
    item.lead_tag || item.verdict || item.outreach_path || item.source
  ]) || "No summary yet"));

  const copyMap = {
    collected: compactLine([item.website, item.phone, item.source]),
    scored: item.reason_summary || compactLine([item.website, item.email, item.phone]),
    queued: item.reason_summary || compactLine([item.website, item.phone, item.fit_classification]),
    completed: compactLine([
      item.verdict,
      item.outreach_path,
      item.partnership_relevance,
      item.email,
      item.phone
    ]) || item.website
  };
  card.appendChild(el("div", "compact-copy", safe(copyMap[variant], "No detail yet")));
  return card;
}

function personText(person) {
  const pieces = [safe(person.name, ""), safe(person.role, "")].filter(Boolean);
  const contacts = [person.email, person.phone, person.linkedin, person.contact_path].filter(Boolean).join(" | ");
  return [pieces.join(" - "), contacts].filter(Boolean).join(" • ");
}

function renderLeadCard(item) {
  const card = el("article", "card");
  const top = el("div", "card-top");
  const left = document.createElement("div");
  left.appendChild(el("h3", "card-title", safe(item.company_name, "Unknown")));
  left.appendChild(el("p", "", safe(item.location || item.city || "", "")));
  top.appendChild(left);
  top.appendChild(el("div", "card-time", safe(
    item.scored_at || item.enriched_at || item.completed_at || item.draft_created_at || item.collected_at,
    ""
  )));
  card.appendChild(top);

  const pills = el("div", "pills");
  [item.location, item.fit_label, item.brain3_event_type, item.brain4_path, item.brain5_verdict]
    .filter((value) => String(value || "").trim())
    .slice(0, 5)
    .forEach((value) => pills.appendChild(el("span", "pill", value)));
  if (pills.childNodes.length) card.appendChild(pills);

  card.appendChild(el("p", "", safe(item.company_description, "No company description yet.")));
  card.appendChild(el("p", "", compactLine([
    item.website,
    item.contact_name,
    item.email,
    item.phone
  ]) || "No direct contact data yet"));

  if (item.key_people && item.key_people.length) {
    card.appendChild(el("p", "", item.key_people.slice(0, 3).map(personText).join(" • ")));
  }
  if (item.channels && item.channels.length) {
    card.appendChild(el("p", "", item.channels.join(" | ")));
  }
  if (safe(item.approval_brief || item.best_contact_strategy, "")) {
    card.appendChild(el("p", "", safe(item.approval_brief || item.best_contact_strategy)));
  }
  return card;
}

function renderAccordionList(targetId, items, emptyText, renderItem) {
  const node = document.getElementById(targetId);
  clear(node);
  if (!items.length) {
    node.appendChild(emptyState(emptyText));
    return;
  }
  const shell = el("div", "accordion-shell");
  const preview = el("div", "accordion-preview");
  items.slice(0, 5).forEach((item) => preview.appendChild(renderItem(item)));
  shell.appendChild(preview);
  if (items.length > 5) {
    const body = el("div", "accordion-body");
    body.hidden = true;
    items.slice(5).forEach((item) => body.appendChild(renderItem(item)));
    shell.appendChild(body);
    const toggle = el("button", "accordion-toggle");
    toggle.type = "button";
    toggle.textContent = "Show " + (items.length - 5) + " more";
    toggle.addEventListener("click", () => {
      body.hidden = !body.hidden;
      toggle.textContent = body.hidden ? "Show " + (items.length - 5) + " more" : "Collapse extra leads";
    });
    shell.appendChild(toggle);
  }
  node.appendChild(shell);
}

function renderQueue(targetId, items, emptyText) {
  renderAccordionList(targetId, items, emptyText, (item) => {
    const wrapper = el("div", "queue-item");
    wrapper.appendChild(renderLeadCard(item));
    return wrapper;
  });
}

function renderActivity(items = []) {
  clear(activityEl);
  if (!items.length) {
    activityEl.appendChild(emptyState("No recent activity yet."));
    return;
  }
  items.forEach((item) => {
    const row = el("div", "feed-item");
    row.appendChild(el("div", "feed-time", formatTime(item.created_at)));
    row.appendChild(el("p", "", safe(item.action, "action")));
    row.appendChild(el("p", "", compactLine([
      item.project_name,
      item.company_name || item.task_title || item.detail
    ]) || "No detail"));
    if (safe(item.detail, "")) {
      row.appendChild(el("p", "", safe(item.detail)));
    }
    activityEl.appendChild(row);
  });
}

function brainMetric(payload, brainKey) {
  const map = {
    brain1: payload.summary.collected_total,
    brain2: payload.summary.brain2_scored_total,
    brain3: payload.summary.brain3_enriched_total,
    brain4: payload.summary.brain4_strategized_total,
    brain5: payload.summary.brain5_reviewed_total,
    finalize: payload.summary.drafted_total
  };
  return map[brainKey] ?? 0;
}

function renderBrainGraph(payload) {
  clear(brainGridEl);
  clear(meshSvgEl);
  const states = Array.isArray(payload.brain_states) ? payload.brain_states : [];
  const items = BRAIN_FLOW.map((key) => states.find((item) => item.brain === key)).filter(Boolean);

  if (!items.length) {
    brainGridEl.appendChild(emptyState("No brain telemetry yet."));
    return;
  }

  items.forEach((item, index) => {
    const card = el("article", "brain-node " + safe(item.status, "idle"));
    const pos = NODE_POSITIONS[index] || { x: 0.5, y: 0.5 };
    card.style.left = "calc(" + (pos.x * 100) + "% - 87px)";
    card.style.top = "calc(" + (pos.y * 100) + "% - 48px)";
    const head = el("div", "brain-node-head");
    head.appendChild(el("h3", "brain-node-title", safe(item.label)));
    head.appendChild(el("div", "brain-status", safe(item.status, "idle")));
    card.appendChild(head);
    card.appendChild(el("div", "brain-node-copy", safe(
      item.action || item.reason || item.project_name || "Standing by for the next handoff.",
      "Standing by for the next handoff."
    )));
    const meta = el("div", "brain-node-meta");
    meta.appendChild(el("span", "brain-metric", "total " + brainMetric(payload, item.brain)));
    if (item.lead_id) meta.appendChild(el("span", "brain-metric", "lead #" + item.lead_id));
    card.appendChild(meta);
    brainGridEl.appendChild(card);
  });

  requestAnimationFrame(() => {
    const nodes = Array.from(brainGridEl.children).filter((node) => node.classList.contains("brain-node"));
    if (!nodes.length) return;
    const gridRect = brainGridEl.getBoundingClientRect();
    const centerX = gridRect.width / 2;
    const centerY = gridRect.height / 2;

    nodes.forEach((node) => {
      const rect = node.getBoundingClientRect();
      const x = rect.left + rect.width / 2 - gridRect.left;
      const y = rect.top + rect.height / 2 - gridRect.top;
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      const dx = Math.abs(x - centerX) * 0.45;
      path.setAttribute("d", "M " + centerX + " " + centerY + " C " + (centerX + dx) + " " + centerY + ", " + (x - dx) + " " + y + ", " + x + " " + y);
      path.setAttribute("class", "mesh-link " + safe(node.classList.contains("running") ? "running" : node.classList.contains("queued") ? "queued" : "idle"));
      meshSvgEl.appendChild(path);
    });

    nodes.slice(0, nodes.length - 1).forEach((node, index) => {
      const next = nodes[index + 1];
      const from = node.getBoundingClientRect();
      const to = next.getBoundingClientRect();
      const x1 = from.left + from.width / 2 - gridRect.left;
      const y1 = from.top + from.height / 2 - gridRect.top;
      const x2 = to.left + to.width / 2 - gridRect.left;
      const y2 = to.top + to.height / 2 - gridRect.top;
      const dx = Math.abs(x2 - x1) * 0.26;
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", "M " + x1 + " " + y1 + " C " + (x1 + dx) + " " + y1 + ", " + (x2 - dx) + " " + y2 + ", " + x2 + " " + y2);
      path.setAttribute("class", "mesh-link " + safe(items[index + 1].status, "idle"));
      meshSvgEl.appendChild(path);
    });
  });
}

function renderTelemetry(payload) {
  const collected = payload.collected_leads || [];
  const topScored = payload.top_scored_leads || [];
  const queued = payload.queued_for_enrich_leads || [];
  const completed = payload.completed_leads || [];

  document.getElementById("collected-count").textContent = String(collected.length);
  document.getElementById("queued-enrich-count").textContent = String(queued.length);
  document.getElementById("top-scored-count").textContent = String(topScored.length);
  document.getElementById("completed-count").textContent = String(completed.length);

  renderAccordionList("collected-list", collected, "No fresh leads collected yet.", (item) => renderCompactLead(item, "collected"));
  renderAccordionList("queued-enrich-list", queued, "Nothing is waiting for enrichment.", (item) => renderCompactLead(item, "queued"));
  renderAccordionList("top-scored-list", topScored, "No scored leads yet.", (item) => renderCompactLead(item, "scored"));
  renderAccordionList("completed-list", completed, "No completed leads yet.", (item) => renderCompactLead(item, "completed"));
  renderBrainGraph(payload);
}

function renderAccordionListInto(node, items, renderItem) {
  if (items.length <= 5) {
    items.forEach((item) => node.appendChild(renderItem(item)));
    return;
  }
  const shell = el("div", "accordion-shell");
  const preview = el("div", "accordion-preview");
  items.slice(0, 5).forEach((item) => preview.appendChild(renderItem(item)));
  shell.appendChild(preview);
  const body = el("div", "accordion-body");
  body.hidden = true;
  items.slice(5).forEach((item) => body.appendChild(renderItem(item)));
  shell.appendChild(body);
  const toggle = el("button", "accordion-toggle");
  toggle.type = "button";
  toggle.textContent = "Show " + (items.length - 5) + " more";
  toggle.addEventListener("click", () => {
    body.hidden = !body.hidden;
    toggle.textContent = body.hidden ? "Show " + (items.length - 5) + " more" : "Collapse extra leads";
  });
  shell.appendChild(toggle);
  node.appendChild(shell);
}

function renderLanes(payload) {
  clear(laneGridEl);
  const stages = payload.stages || {};
  ["initial", "scored", "enriched", "strategized", "drafted"].forEach((stageKey) => {
    const stage = stages[stageKey] || { label: stageKey, items: [] };
    const lane = el("section", "lane");
    const head = el("div", "lane-head");
    head.appendChild(el("h3", "card-title", safe(stage.label)));
    head.appendChild(el("div", "card-time", String((stage.items || []).length)));
    lane.appendChild(head);
    const list = el("div", "lane-list");
    if (!(stage.items || []).length) {
      list.appendChild(emptyState("Nothing here yet."));
    } else {
      renderAccordionListInto(list, stage.items, (item) => renderLeadCard(item));
    }
    lane.appendChild(list);
    laneGridEl.appendChild(lane);
  });
}

function renderTop(payload) {
  const selectedTitle = document.getElementById("selected-project-title");
  if (payload.selected_project) {
    selectedTitle.textContent = payload.selected_project.name + " • " + safe(payload.generated_at);
  } else {
    selectedTitle.textContent = "Live Queues";
  }
  const nextText = payload.next_work
    ? safe(payload.next_work.action) + " • " + safe(payload.next_work.project_name, "unassigned") + (payload.next_work.lead_id ? " • lead #" + payload.next_work.lead_id : "")
    : "No queued work";
  nextWorkChip.textContent = nextText;
}

async function loadLiveBoard() {
  const backendUrl = normalizeUrl(state.backendUrl);
  if (!backendUrl) {
    updateConnection(false, "Backend URL is not configured", "");
    return;
  }
  const params = new URLSearchParams();
  if (state.projectId) params.set("project_id", String(state.projectId));
  const url = backendUrl + "/api/live-dashboard" + (params.toString() ? "?" + params.toString() : "");
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error("HTTP " + response.status);
    const payload = await response.json();
    renderTop(payload);
    renderMetrics(payload.summary || {});
    renderProjects(payload);
    renderTelemetry(payload);
    renderQueue("approval-list", payload.pending_approvals || [], "No lead approvals waiting.");
    renderQueue("message-approval-list", payload.pending_message_approvals || [], "No message approvals waiting.");
    renderActivity(payload.recent_activity || []);
    renderLanes(payload);
    if (!state.projectId && payload.selected_project) {
      state.projectId = String(payload.selected_project.id);
      localStorage.setItem("ai_agents_project_id", state.projectId);
    }
    updateConnection(true, "Live backend connected", payload.generated_at);
  } catch (error) {
    updateConnection(false, "Backend connection failed: " + safe(error.message, "unknown error"), "");
  }
}

function schedulePolling() {
  if (state.timer) window.clearInterval(state.timer);
  state.timer = window.setInterval(loadLiveBoard, state.refreshMs);
}

schedulePolling();
if (state.backendUrl) {
  localStorage.setItem("ai_agents_backend_url", state.backendUrl);
  loadLiveBoard();
} else {
  renderMetrics({});
  renderProjects({ projects: [], selected_project: null });
  renderActivity([]);
  renderLanes({ stages: {} });
  renderBrainGraph({ brain_states: [], summary: {} });
}
