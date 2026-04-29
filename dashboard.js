const state = {
  snapshotUrl: "./latest-dashboard.json",
  refreshMs: 60000,
  timer: null
};

const ACTIVE_FLOW_STAGES = [
  { key: "brain3", label: "Brain 3" },
  { key: "brain5", label: "Brain 5" },
  { key: "approval", label: "Lead Approval" },
  { key: "message", label: "Message Approval" }
];

const summaryGrid = document.getElementById("summary-grid");
const journeyList = document.getElementById("journey-list");
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

function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

function formatTime(value) {
  if (!value) return "No data";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return safe(value, "No data");
  return date.toLocaleString("en-GB", { dateStyle: "short", timeStyle: "medium" });
}

function countApproval(payload) {
  const leadApprovals = Array.isArray(payload.pending_approvals) ? payload.pending_approvals.length : 0;
  const messageApprovals = Array.isArray(payload.pending_message_approvals) ? payload.pending_message_approvals.length : 0;
  return payload.summary?.waiting_approvals ?? leadApprovals + messageApprovals;
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
      text: "Leads enriched with deeper event and company context."
    },
    {
      key: "approval",
      label: "Waiting",
      title: "Pending Approval",
      value: Array.isArray(payload.pending_approvals) ? payload.pending_approvals.length : countApproval(payload),
      text: "Leads waiting for lead approval."
    },
    {
      key: "brain5",
      label: "Reviewed",
      title: "Brain 5 Review",
      value: summary.brain5_reviewed_total ?? 0,
      text: "Leads reviewed and expanded before approval."
    },
    {
      key: "message",
      label: "Message",
      title: "Message Approval",
      value: Array.isArray(payload.pending_message_approvals) ? payload.pending_message_approvals.length : 0,
      text: "Approved leads waiting for message approval."
    }
  ];
}

function deriveActiveLeadFlows(payload) {
  const leads = new Map();

  function upsert(items, stageKey) {
    (Array.isArray(items) ? items : []).forEach((item) => {
      const leadId = Number(item.lead_id || item.id || 0);
      if (!leadId) return;
      const stageIndex = ACTIVE_FLOW_STAGES.findIndex((stage) => stage.key === stageKey);
      if (stageIndex === -1) return;
      const existing = leads.get(leadId);
      if (!existing || stageIndex > existing.stageIndex) {
        leads.set(leadId, {
          leadId,
          companyName: safe(item.company_name, "Lead #" + leadId),
          location: safe(item.location || item.city, ""),
          stageIndex,
          stageKey
        });
      }
    });
  }

  upsert(payload?.stages?.enriched?.items, "brain3");
  upsert(payload?.stages?.strategized?.items, "brain5");
  upsert(payload?.pending_approvals, "approval");
  upsert(payload?.pending_message_approvals, "message");

  const states = Array.isArray(payload.brain_states) ? payload.brain_states : [];
  states.forEach((brain) => {
    const leadId = Number(brain.lead_id || 0);
    if (!leadId) return;
    const stageMap = {
      brain3: "brain3",
      brain5: "brain5"
    };
    const stageKey = stageMap[brain.brain];
    if (!stageKey) return;
    upsert([{ lead_id: leadId, company_name: "Lead #" + leadId }], stageKey);
  });

  return Array.from(leads.values())
    .sort((a, b) => b.stageIndex - a.stageIndex || a.leadId - b.leadId)
    .slice(0, 12);
}

function leadColor(leadId) {
  const hue = (leadId * 53) % 360;
  return "hsl(" + hue + " 82% 64%)";
}

function stagePosition(index) {
  if (ACTIVE_FLOW_STAGES.length === 1) return 0;
  return (index / (ACTIVE_FLOW_STAGES.length - 1)) * 100;
}

function renderJourney(payload) {
  clear(journeyList);
  const activeLeads = deriveActiveLeadFlows(payload);

  if (!activeLeads.length) {
    journeyList.appendChild(el("div", "journey-empty", "No active leads are currently moving through Brain 3, Brain 5, or approval."));
    return;
  }

  activeLeads.forEach((lead) => {
    const color = leadColor(lead.leadId);
    const row = el("article", "journey-row");

    const leadInfo = el("div", "journey-lead");
    leadInfo.appendChild(el("div", "journey-lead-name", lead.companyName));
    leadInfo.appendChild(el("div", "journey-lead-meta", [lead.location, "Lead #" + lead.leadId].filter(Boolean).join(" • ")));
    row.appendChild(leadInfo);

    const track = el("div", "journey-track");
    track.style.setProperty("--lead-color", color);

    const line = el("div", "journey-track-line");
    line.style.width = stagePosition(lead.stageIndex) + "%";
    track.appendChild(line);

    ACTIVE_FLOW_STAGES.forEach((stage, index) => {
      const stop = el("span", "journey-stop");
      stop.style.left = stagePosition(index) + "%";
      stop.style.setProperty("--lead-color", color);
      if (index <= lead.stageIndex) stop.classList.add("done");
      if (index === lead.stageIndex) stop.classList.add("current");
      stop.title = stage.label;
      track.appendChild(stop);
    });

    row.appendChild(track);
    journeyList.appendChild(row);
  });
}

function renderSummary(payload) {
  clear(summaryGrid);
  stageData(payload).forEach((item) => {
    const card = el("article", "summary-card");
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
