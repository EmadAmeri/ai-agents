const readJson = async (path, fallback) => {
  try {
    const response = await fetch(path, { cache: "no-store" });
    if (!response.ok) return fallback;
    return await response.json();
  } catch {
    return fallback;
  }
};

const pct = (value, max) => Math.max(0, Math.min(100, Math.round((Number(value || 0) / Math.max(Number(max || 1), 1)) * 100)));

const render = async () => {
  const [state, stats, sources, flow, leads, memory, observability] = await Promise.all([
    readJson("data/agent_state.json", {}),
    readJson("data/pipeline_stats.json", {}),
    readJson("data/source_quality.json", { sources: [] }),
    readJson("data/lead_flow.json", { stages: [] }),
    readJson("data/latest_enriched.json", { leads: [] }),
    readJson("data/agent_memory.json", {}),
    readJson("data/agent_observability.json", {}),
  ]);

  document.getElementById("agentState").textContent = state.state || "Paused";
  document.getElementById("agentSub").textContent = state.current_action || "Waiting for the next cycle";
  document.getElementById("updatedAt").textContent = (state.updated_at || stats.updated_at || "").replace("T", " ").replace("+00:00", " UTC");
  document.getElementById("agentOrb").style.background = state.state === "Paused"
    ? "radial-gradient(circle at 35% 30%, #fff, #91a0b8 18%, #45556f 52%, #151c28 80%)"
    : "";

  const leadFlow = document.getElementById("leadFlow");
  leadFlow.innerHTML = (flow.stages || []).map((stage) => `
    <div class="stage">
      <span>${stage.label}</span>
      <b>${stage.value || 0}</b>
    </div>
  `).join("");

  const sourceNodes = document.getElementById("sourceNodes");
  sourceNodes.innerHTML = (sources.sources || []).slice(0, 7).map((source, index) => {
    const angle = (index / Math.max((sources.sources || []).length, 1)) * Math.PI * 2;
    const radius = index === 0 ? 0 : 74;
    const left = 42 + Math.cos(angle) * radius;
    const top = 42 + Math.sin(angle) * 48;
    const size = Math.max(54, Math.min(105, 48 + Number(source.weight || 1) * 22));
    return `<div class="node" style="left:${left}%;top:${top}%;--size:${size}px;--glow:${20 + Number(source.quality || 0) / 2};">${source.name}</div>`;
  }).join("");

  const funnel = document.getElementById("qualityFunnel");
  const stages = flow.stages || [];
  const max = Math.max(...stages.map((stage) => Number(stage.value || 0)), 1);
  funnel.innerHTML = stages.map((stage) => `
    <div class="funnel-row" style="width:${Math.max(28, pct(stage.value, max))}%">${stage.value || 0} ${stage.label}</div>
  `).join("");

  const progress = [
    ["Raw", stats.raw_collected_today, stats.daily_raw_target_max],
    ["Scored", stats.scored_today, Math.max(stats.raw_collected_today, 1)],
    ["Enriched", stats.enriched_today, 30],
    ["Quality", stats.quality_average, 100],
  ];
  document.getElementById("progressRings").innerHTML = progress.map(([label, value, maxValue]) => `
    <div class="progress" style="--pct:${pct(value, maxValue)}"><div><span>${label}</span><b>${value || 0}</b></div></div>
  `).join("");

  document.getElementById("leadCards").innerHTML = (leads.leads || []).map((lead) => `
    <div class="lead-card">
      <b>${lead.company_name || "Company"}</b>
      <div class="score">${lead.score || 0}</div>
      <small>${lead.country || ""}</small>
      <small>${lead.reason || ""}</small>
    </div>
  `).join("") || `<div class="lead-card"><b>No preview yet</b><small>Run a cycle to publish safe company summaries.</small></div>`;

  const tags = [
    ["Best source", memory.best_source_today],
    ["Best keyword", memory.best_keyword_today],
    ["Weak source", memory.weak_source_today],
    ["Next", memory.next_improvement],
    ["Queues", Object.values(observability.queue_sizes || {}).reduce((a, b) => a + Number(b || 0), 0)],
    ["Dupes", `${observability.duplicate_rate || 0}%`],
    ["Errors", `${observability.error_rate || 0}%`],
  ];
  document.getElementById("memoryTags").innerHTML = tags.map(([label, value]) => `<span class="tag">${label}: ${value || "-"}</span>`).join("");
};

render();
setInterval(render, 120000);
