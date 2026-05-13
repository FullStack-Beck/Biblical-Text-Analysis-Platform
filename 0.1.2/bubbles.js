let nodes = [];
let relationships = [];
let relationshipMap = new Map();
let showAllRelationships = false;

let simulation;
let circles;
let links;
let svgGroup;

let currentColor = "theological_theme";
let currentShape = "action_type";
let currentSize  = "cross_reference_count";
let currentGroup = "none";

let hoverHighlight          = null;
let activeHighlights        = new Map();
let activeRelationshipTypes = new Set();
let relatedActive           = new Set();
let activeNodeKey = null;

const BASE_SIZE = 120;

function W() { return window.innerWidth;  }
function H() { return window.innerHeight; }

const AVAILABLE_FIELDS = [
  "book","speaker","source_authority","audience_scope","audience_role",
  "audience_identity","covenant","command_form","authority_level","polarity",
  "theological_theme","literary_form","action_type","speech_act","target_object",
  "semantic_domain","translation_family","language_source","confidence"
];

// ─── DATA LOAD ────────────────────────────────────────────────────────────────

Promise.all([
  d3.json("NodesCombined.json"),
  d3.json("RelationshipsCombined.json")
]).then(([nodeData, relationshipData]) => {

  const SPEAKER_GROUPS = {
  
  "Angel of the LORD": 'Angels',
  "Angel": 'Angels',

  "Josephs brothers": 'Sons of Jacob',
  "Sons of Jacob": 'Sons of Jacob',

  Jacob: 'Jacob-Israel',
  Israel: 'Jacob-Israel',

  Abram: 'Abraham',
  Abraham: 'Abraham',

  Sarai: 'Sarah',
  Sarah: 'Sarah',

  Simon: 'Peter',
  Peter: 'Peter',

  Saul: 'Paul',
  Paul: 'Paul'
};

function normalizeSpeakerGroup(name) {
  return SPEAKER_GROUPS[name] || name || 'Unknown';
}

  nodes = nodeData.map(d => ({
    ...d,
    chapter_start:        +d.chapter_start,
    verse_start:          +d.verse_start,
    chapter_end:          +d.chapter_end,
    verse_end:            +d.verse_end,
    sliceAngle: Math.random(),
    speaker_group: normalizeSpeakerGroup(d.speaker),
    repetition_count:     +d.repetition_count     || 0,
    cross_reference_count:+d.cross_reference_count || 0,
    confidence_score:
      d.confidence === "high"   ? 1 :
      d.confidence === "medium" ? 0.66 : 0.33,
    radius: 8
  }));

  relationships = relationshipData;

  buildRelationshipMap();
  initControls();
  initVisualization();

  applyColors(currentColor);
  applyShapes(currentShape);
  applySizing(currentSize);

  document.getElementById("nodeCount").textContent         = nodes.length;
  document.getElementById("relationshipCount").textContent = relationships.length;
});

// ─── RELATIONSHIP MAP ─────────────────────────────────────────────────────────

function buildRelationshipMap() {
  relationshipMap.clear();
  relationships.forEach(rel => {
    if (!relationshipMap.has(rel.source_key)) relationshipMap.set(rel.source_key, []);
    relationshipMap.get(rel.source_key).push({ ...rel, direction: "outgoing" });

    if (!relationshipMap.has(rel.target_key)) relationshipMap.set(rel.target_key, []);
    relationshipMap.get(rel.target_key).push({ ...rel, direction: "incoming" });
  });
}

// ─── CONTROLS ────────────────────────────────────────────────────────────────

function initControls() {
  const colorSelect = document.getElementById("colorSelect");
  const shapeSelect = document.getElementById("shapeSelect");

  AVAILABLE_FIELDS.forEach(field => {
    const co = document.createElement("option");
    co.value = field; co.textContent = prettify(field);
    colorSelect.appendChild(co);

    const so = document.createElement("option");
    so.value = field; so.textContent = prettify(field);
    shapeSelect.appendChild(so);
  });

  colorSelect.value = currentColor;
  shapeSelect.value = currentShape;

  colorSelect.onchange = e => applyColors(e.target.value);
  shapeSelect.onchange = e => applyShapes(e.target.value);
  document.getElementById("groupSelect").onchange = e => setGroup(e.target.value);
  document.getElementById("sizeSelect").onchange  = e => applySizing(e.target.value);

  document.getElementById("toggleBtn").onclick = () =>
    document.getElementById("controls").classList.toggle("open");

  document.getElementById("closePanel").onclick = () =>
    document.getElementById("detailPanel").classList.remove("open");

  document.getElementById("searchInput").addEventListener("input", e =>
    applySearch(e.target.value.toLowerCase()));

  document.getElementById("toggleRelationshipBtn").onclick = () => {

    showAllRelationships = !showAllRelationships;
    const btn = document.getElementById("toggleRelationshipBtn");
    btn.textContent = showAllRelationships ? "Hide Relationships" : "Show Relationships";
    if (showAllRelationships) {
      activeNodeKey = null; // Clear any active node selection
    }

    toggleRelationshipVisibility();
  };

  buildRelationshipFilters();
}

// ─── VISUALIZATION INIT ───────────────────────────────────────────────────────

function initVisualization() {
  const w = W();
  const h = H();

  const svg = d3.select("#canvas")
    .attr("width",   w)
    .attr("height",  h)
    .attr("viewBox", `0 0 ${w} ${h}`);

  // Single root group — zoom/pan transform goes here
  svgGroup = svg.append("g").attr("id", "root");
  svgGroup.append("g").attr("id", "linksLayer");
  svgGroup.append("g").attr("id", "nodesLayer");
  svgGroup.append("g").attr("id", "labelsLayer");

  // Zoom + pan
  svg.call(
    d3.zoom()
      .scaleExtent([0.1, 5])
      .on("zoom", ({ transform }) => svgGroup.attr("transform", transform))
  );

  links = d3.select("#linksLayer")
    .selectAll("line")
    .data(relationships)
    .enter()
    .append("line")
    .attr("stroke", "#475569")
    .attr("stroke-opacity", 0)
    .attr("stroke-width", d => Math.max(1, d.strength * 3));

  circles = d3.select("#nodesLayer")
    .selectAll("path")
    .data(nodes)
    .enter()
    .append("path")
    .attr("fill",         "#64748b")
    .attr("stroke",       "#0f172a")
    .attr("stroke-width", 1)
    .style("cursor",      "pointer")
    .on("click", (event, d) => {

    if (activeNodeKey === d.canonical_key) {
        clearRelationshipHighlight();
        activeNodeKey = null;
        return;
    }

    activeNodeKey = d.canonical_key;

    showAllRelationships = false;

    const btn = document.getElementById("toggleRelationshipBtn");

    if (btn) {
      btn.textContent = "Show All Relationships";
    }

    showDetails(d);
    highlightRelationships(d);
    })
    .on("mouseenter", (event, d) => hoverNode(d))
    .on("mouseleave", ()          => clearHover());

  circles.append("title")
    .text(d => `${d.book} ${d.chapter_start}:${d.verse_start}`);

  // THE FIX:
  // forceCenter alone is too weak for large node sets — it only adjusts the
  // mean position but doesn't actively pull nodes. Adding forceX + forceY
  // with a small strength creates a constant gentle pull toward the viewport
  // centre every tick, preventing the whole cloud from drifting off-screen.
  simulation = d3.forceSimulation(nodes)
    .force("charge",    d3.forceManyBody().strength(-25))
    .force("center",    d3.forceCenter(w / 2, h / 2))
    .force("x",         d3.forceX(w / 2).strength(0.05))
    .force("y",         d3.forceY(h / 2).strength(0.05))
    .force(
      "collision",
      d3.forceCollide().radius(d =>
        Math.sqrt(getNodeSize(d)) * 0.055 + 1.5
      )
    )
    .on("tick", ticked);

  window.addEventListener("resize", () => {
    const nw = W();
    const nh = H();

    d3.select("#canvas")
      .attr("width",   nw)
      .attr("height",  nh)
      .attr("viewBox", `0 0 ${nw} ${nh}`);

    simulation
      .force("center", d3.forceCenter(nw / 2, nh / 2))
      .force("x",      d3.forceX(nw / 2).strength(0.05))
      .force("y",      d3.forceY(nh / 2).strength(0.05));

    if (currentGroup !== "none") setGroup(currentGroup);
    simulation.alpha(0.3).restart();
  });
}

// ─── TICK ─────────────────────────────────────────────────────────────────────

function ticked() {
  circles.attr("transform", d => `translate(${d.x},${d.y})`);

  links
    .attr("x1", d => getNode(d.source_key)?.x ?? 0)
    .attr("y1", d => getNode(d.source_key)?.y ?? 0)
    .attr("x2", d => getNode(d.target_key)?.x ?? 0)
    .attr("y2", d => getNode(d.target_key)?.y ?? 0);

  // Keep group labels anchored to the live centroid of their nodes
  if (currentGroup !== "none") {
    d3.select("#labelsLayer").selectAll("text").attr("x", function() {
      const g = this.__groupKey__;
      if (!g) return +this.getAttribute("x");
      const members = nodes.filter(d => d[currentGroup] === g);
      if (!members.length) return +this.getAttribute("x");
      return members.reduce((s, d) => s + d.x, 0) / members.length;
    })
    .attr("y", function() {
      const g = this.__groupKey__;
      if (!g) return +this.getAttribute("y");
      const members = nodes.filter(d => d[currentGroup] === g);
      if (!members.length) return +this.getAttribute("y");
      // Place label above the group centroid
      const cy = members.reduce((s, d) => s + d.y, 0) / members.length;
      const minY = Math.min(...members.map(d => d.y));
      return minY - 22;
    });
  }
}

function getNode(key) {
  return nodes.find(n => n.canonical_key === key);
}

// ─── COLOR ────────────────────────────────────────────────────────────────────

function getColorScale(field) {
  const values = [...new Set(nodes.map(d => d[field]).filter(Boolean))];
  return d3.scaleOrdinal()
    .domain(values)
    .range(d3.schemeTableau10.concat(d3.schemeSet3));
}

function applyColors(field) {
  currentColor = field;
  const scale  = getColorScale(field);
  circles.transition().duration(400)
    .attr("fill", d => scale(d[field] || "unknown"));
  buildColorLegend(field, scale);
}

// ─── SHAPE ────────────────────────────────────────────────────────────────────

function getShapeScale(field) {
  const values = [...new Set(nodes.map(d => d[field]).filter(Boolean))];
  const shapes = [
    d3.symbolCircle, d3.symbolSquare, d3.symbolTriangle,
    d3.symbolDiamond, d3.symbolCross, d3.symbolStar, d3.symbolWye
  ];
  return d3.scaleOrdinal().domain(values).range(shapes);
}

function applySizing(field) {
  currentSize  = field;
  const shapeScale = getShapeScale(currentShape);
  circles.transition().duration(400)
    .attr("d", d => {
      const symbol = shapeScale(d[currentShape]) || d3.symbolCircle;
      return d3.symbol().type(symbol).size(getNodeSize(d))();
    });
}

function getNodeSize(d) {
  switch (currentSize) {
    case "cross_reference_count": return BASE_SIZE + (d.cross_reference_count * 25);
    case "repetition_count":      return BASE_SIZE + (d.repetition_count      * 35);
    case "confidence_score":      return BASE_SIZE + (d.confidence_score      * 250);
    default:                      return BASE_SIZE;
  }
}

// ─── LEGEND ───────────────────────────────────────────────────────────────────

function buildColorLegend(field, scale) {
  const container = document.getElementById("colorLegend");
  container.innerHTML = "";

  scale.domain().forEach(value => {
    const row = document.createElement("div");
    row.className = "legend-item";
    row.innerHTML = `
      <div class="legend-color" style="background:${scale(value)}"></div>
      <div>${value}</div>`;
    row.onmouseenter = () => { hoverHighlight = { field, value }; updateHighlights(); };
    row.onmouseleave = () => { hoverHighlight = null;             updateHighlights(); };
    row.onclick      = () => toggleHighlight(field, value);
    container.appendChild(row);
  });
}

function buildShapeLegend(field, scale) {

  const container = document.getElementById("shapeLegend");
  container.innerHTML = "";

  scale.domain().forEach(value => {

    const row = document.createElement("div");
    row.className = "legend-item";

    // icon
    const icon = document.createElement("div");
    icon.style.width = "18px";
    icon.style.height = "18px";
    icon.style.display = "flex";
    icon.style.alignItems = "center";
    icon.style.justifyContent = "center";

    const svg = d3.create("svg")
      .attr("width", 18)
      .attr("height", 18);

    svg.append("path")
      .attr(
        "d",
        d3.symbol()
          .type(scale(value))
          .size(70)()
      )
      .attr("transform", "translate(9,9)")
      .attr("fill", "#cbd5e1");

    icon.appendChild(svg.node());

    // label
    const label = document.createElement("div");
    label.textContent = prettify(value);

    row.appendChild(icon);
    row.appendChild(label);

    row.onmouseenter = () => {
      hoverHighlight = { field, value };
      updateHighlights();
    };

    row.onmouseleave = () => {
      hoverHighlight = null;
      updateHighlights();
    };

    row.onclick = () => toggleHighlight(field, value);

    container.appendChild(row);
  });
}

function toggleHighlight(field, value) {
  if (!activeHighlights.has(field)) activeHighlights.set(field, new Set());
  const set = activeHighlights.get(field);
  set.has(value) ? set.delete(value) : set.add(value);
  updateHighlights();
}

function updateHighlights() {
  circles.attr("opacity", d => {
    if (relatedActive.size > 0)
      return relatedActive.has(d.canonical_key) ? 1 : 0.08;
    if (hoverHighlight)
      return d[hoverHighlight.field] === hoverHighlight.value ? 1 : 0.1;
    if (activeHighlights.size === 0) return 1;
    for (const [field, values] of activeHighlights.entries())
      if (values.has(d[field])) return 1;
    return 0.1;
  });
}

// ─── RELATIONSHIP HIGHLIGHTING ────────────────────────────────────────────────
function toggleRelationshipVisibility() {
  
  if(showAllRelationships) {

    relatedActive.clear(); // Clear any active relationship highlights

    circles.attr("opacity", 1); // Reset all nodes to full opacity

    links.attr("stroke-opacity", d => {
      if (activeRelationshipTypes.size > 0 && !activeRelationshipTypes.has(d.relationship_type)) return 0;
      return 0.25; // Show all relationships with a default opacity
    })
    .attr("stroke", d => relationshipColor(d.relationship_type)); // Set stroke color based on relationship type

    return;
  }

  if (activeNodeKey) { // if there's an active node

    const node = getNode(activeNodeKey); // Get the active node using its canonical key

    if (node) {
      highlightRelationships(node); // Re-apply highlight to the active node and its relationships
      return;
    }
  }

  links.attr("stroke-opacity", 0); // If no active node, hide all relationships
  circles.attr("opacity", 1); // Reset all nodes to full opacity
}
function highlightRelationships(node) {
  relatedActive.clear();
  relatedActive.add(node.canonical_key);

  (relationshipMap.get(node.canonical_key) || []).forEach(rel => {
    relatedActive.add(rel.direction === "outgoing" ? rel.target_key : rel.source_key);
  });

  updateHighlights();

  links
    .attr("stroke-opacity", d => {
      if (activeRelationshipTypes.size > 0 && !activeRelationshipTypes.has(d.relationship_type))
        return 0;
      return (d.source_key === node.canonical_key || d.target_key === node.canonical_key)
        ? 0.9 : 0;
    })
    .attr("stroke", d => relationshipColor(d.relationship_type));
}

function clearRelationshipHighlight() {

  relatedActive.clear();

  activeNodeKey = null;

  document.getElementById("detailPanel").classList.remove("open");

  toggleRelationshipVisibility(); // This will reset all relationship highlights and node opacities
}

function relationshipColor(type) {
  const map = {
    quotation:           "#f59e0b",
    direct_repeat:       "#10b981",
    thematic_repeat:     "#3b82f6",
    fulfillment:         "#ef4444",
    contrast:            "#8b5cf6",
    typology:            "#14b8a6",
    covenant_transition: "#f97316"
  };
  return map[type] || "#64748b";
}

function buildRelationshipFilters() {
  const container = document.getElementById("relationshipFilters");
  const types = [...new Set(relationships.map(r => r.relationship_type))].sort();

  types.forEach(type => {
    const row = document.createElement("div");
    row.className = "legend-item";
    row.innerHTML = `
      <div class="legend-color" style="background:${relationshipColor(type)}"></div>
      <div>${type}</div>`;
    row.onclick = () => {

      activeRelationshipTypes.has(type)
        ? activeRelationshipTypes.delete(type)
        : activeRelationshipTypes.add(type);

      toggleRelationshipVisibility();
    };
    container.appendChild(row);
  });
}

// ─── GROUPING ─────────────────────────────────────────────────────────────────

function setGroup(field) {
  currentGroup = field;
  const w = W();
  const h = H();

  if (field === "none") {

    d3.select("#labelsLayer")
      .selectAll("*")
      .remove();

    simulation
      .force("slice", null)
      .force("groupX", null)
      .force("groupY", null)

      .force("center",
        d3.forceCenter(w / 2, h / 2)
      )

      .force("x",
        d3.forceX(w / 2).strength(0.05)
      )

      .force("y",
        d3.forceY(h / 2).strength(0.05)
      );

    simulation.alpha(1).restart();

    return;
  }

  const groups = [...new Set(nodes.map(d => d[field]).filter(Boolean))];
  const angleMap = {};
  groups.forEach((g, i) => { angleMap[g] = (i / groups.length) * Math.PI * 2; });

  const radius = Math.min(w, h) * 0.34;

  const slices = buildSlices(field);

  simulation
    .force("x", null)
    .force("y", null)
    .force("center", null)

    .force(
      "slice",
      sliceForce(
        field,
        slices,
        w / 2,
        h / 2,
        radius
      )
    )

    .force(
      "collision",
      d3.forceCollide().radius(d =>
        Math.sqrt(getNodeSize(d)) * 0.055 + 1.5
      )
    );

  drawSliceLabels(
    slices,
    w / 2,
    h / 2,
    radius 
  );

  simulation.alpha(1).restart();
}

function drawGroupLabels(groups, angleMap, w, h, radius) {
  const layer = d3.select("#labelsLayer");
  layer.selectAll("*").remove();

  groups.forEach(g => {
    const members = nodes.filter(d => d[currentGroup] === g);
    let x, y;
    if (members.length) {
      x = members.reduce((s, d) => s + (d.x || w / 2), 0) / members.length;
      const minY = Math.min(...members.map(d => d.y || h / 2));
      y = minY - 22;
    } else {
      x = w / 2 + Math.cos(angleMap[g]) * (radius + 110);
      y = h / 2 + Math.sin(angleMap[g]) * (radius + 110);
    }

    const el = layer.append("text")
      .attr("x", x)
      .attr("y", y)
      .attr("text-anchor",       "middle")
      .attr("dominant-baseline", "middle")
      .attr("fill",        "#e2e8f0")
      .attr("font-size",   "16px")
      .attr("font-weight", "700")
      .attr("opacity",     0.9)
      .style("pointer-events", "none")
      .text(prettify(g));

    el.node().__groupKey__ = g;
  });
}

function buildSlices(type) {

  const groups = [
    ...new Set(
      nodes.map(d => d[type]).filter(Boolean)
    )
  ];

  // count nodes per group
  const counts = {};

  groups.forEach(g => counts[g] = 0);

  nodes.forEach(d => {
    counts[d[type]]++;
  });

  // sort biggest first
  groups.sort((a, b) => counts[b] - counts[a]);

  const slices = {};

  // ---------- KEY SETTINGS ----------

  const minSlice = 0.28; // minimum radians per group
  const extraWeight = 0.0025; // how much bigger groups expand

  // ----------------------------------

  let totalWeight = 0;

  groups.forEach(g => {
    totalWeight += minSlice + counts[g] * extraWeight;
  });

  let current = 0;
  const gap = 0.12;

  groups.forEach(g => {

    const weight =
      minSlice +
      counts[g] * extraWeight;

    const angleSize =
      (weight / totalWeight) *
      Math.PI * 2;

    slices[g] = {
      start: current + gap,
      end: current + angleSize - gap,
      count: counts[g]
    };

    current += angleSize;
  });

  return slices;
}

function drawSliceLabels(slices, cx, cy, radius) {

  const layer = d3.select("#labelsLayer");

  layer.selectAll("*").remove();

  Object.entries(slices).forEach(([g, s]) => {

    // Use the current centroid of the group's nodes as the initial position
    const members = nodes.filter(d => d[currentGroup] === g);
    let x = cx, y = cy;
    if (members.length) {
      x = members.reduce((sum, d) => sum + (d.x || cx), 0) / members.length;
      const minY = Math.min(...members.map(d => d.y || cy));
      y = minY - 22;
    } else {
      // Fallback to angle-based position
      const angle = (s.start + s.end) / 2;
      const offset = 260;
      const labelRadius = radius + offset;
      x = cx + Math.cos(angle) * labelRadius;
      y = cy + Math.sin(angle) * labelRadius;
    }

    const el = layer.append("text")
      .attr("x", x)
      .attr("y", y)
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "middle")
      .attr("fill", "#e2e8f0")
      .attr("font-size", "15px")
      .attr("font-weight", "700")
      .style("pointer-events", "none")
      .text(prettify(g));

    // Store the group key so ticked() can reposition by centroid
    el.node().__groupKey__ = g;
  });
}

function sliceForce(type, slices, cx, cy, radius) {
  return function(alpha) {

    nodes.forEach(d => {
      const g = d[type];
      if (!g || !slices[g]) return;

      const slice = slices[g];

      const angle =
  slice.start +
  d.sliceAngle * (slice.end - slice.start);

      const groupSize = slices[g].count;

      // bigger groups get pulled inward
      const localRadius =
        radius -
        Math.sqrt(groupSize) * 6;

      const targetX =
        cx + Math.cos(angle) * localRadius;

      const targetY =
        cy + Math.sin(angle) * localRadius;
      // stable pull (NOT velocity injection)
      d.vx += (targetX - d.x) * 0.12 * alpha;
      d.vy += (targetY - d.y) * 0.12 * alpha;

      d.vx *= 0.78;
      d.vy *= 0.78;
    });
  };
}

// ─── SEARCH ───────────────────────────────────────────────────────────────────

function applyShapes(field) {
  currentShape = field;

  const scale = getShapeScale(field);

  circles.transition().duration(400)
    .attr("d", d => {
      const symbol = scale(d[field]) || d3.symbolCircle;

      return d3.symbol()
        .type(symbol)
        .size(getNodeSize(d))();
    });

  buildShapeLegend(field, scale);
}

// ─── HOVER ────────────────────────────────────────────────────────────────────

function hoverNode(node) {
  const rels = relationshipMap.get(node.canonical_key) || [];
  circles.attr("opacity", d => {
    if (d.canonical_key === node.canonical_key) return 1;
    return rels.some(r => r.target_key === d.canonical_key || r.source_key === d.canonical_key)
      ? 0.9 : 0.12;
  });
}

function clearHover() { updateHighlights(); }

// ─── DETAIL PANEL ─────────────────────────────────────────────────────────────

function showDetails(d) {
  const panel   = document.getElementById("detailPanel");
  const content = document.getElementById("detailContent");
  panel.classList.add("open");

  const rels = relationshipMap.get(d.canonical_key) || [];

  content.innerHTML = `
    <h2>${d.book} ${d.chapter_start}:${d.verse_start}</h2>
    <div class="command-card">
      <div style="font-size:15px;line-height:1.6;margin-bottom:14px;">${d.full_scripture}</div>
      <div style="font-size:14px;color:#cbd5e1;margin-bottom:16px;">${d.command_summary || "No summary"}</div>
      <div class="detail-grid">
        ${detailItem("Speaker",          d.speaker)}
        ${detailItem("Authority",        d.source_authority)}
        ${detailItem("Audience Scope",   d.audience_scope)}
        ${detailItem("Audience Identity",d.audience_identity)}
        ${detailItem("Audience Role",    d.audience_role)}
        ${detailItem("Covenant",         d.covenant)}
        ${detailItem("Command Form",     d.command_form)}
        ${detailItem("Authority Level",  d.authority_level)}
        ${detailItem("Polarity",         d.polarity)}
        ${detailItem("Theme",            d.theological_theme)}
        ${detailItem("Literary Form",    d.literary_form)}
        ${detailItem("Action Type",      d.action_type)}
        ${detailItem("Speech Act",       d.speech_act)}
        ${detailItem("Target",           d.target_object)}
        ${detailItem("Semantic Domain",  d.semantic_domain)}
        ${detailItem("Translation",      d.translation_source)}
        ${detailItem("Language",         d.language_source)}
        ${detailItem("Confidence",       d.confidence)}
        ${detailItem("Repetition Count", d.repetition_count)}
        ${detailItem("Cross References", d.cross_reference_count)}
      </div>
      <div style="margin-top:18px;">
        <div class="detail-label">Interpretation Notes</div>
        <div style="font-size:13px;line-height:1.6;">${d.interpretation_notes || "None"}</div>
      </div>
      <div style="margin-top:18px;">
        <div class="detail-label">Relationships</div>
        ${rels.map(r => `
          <div style="margin-top:10px;background:#1e293b;padding:10px;border-radius:8px;">
            <div style="font-weight:bold;color:${relationshipColor(r.relationship_type)};">${r.relationship_type}</div>
            <div style="font-size:12px;margin-top:4px;">→ ${r.direction === "outgoing" ? r.target_key : r.source_key}</div>
            <div style="font-size:12px;color:#94a3b8;margin-top:4px;">Strength: ${r.strength}</div>
            <div style="font-size:12px;margin-top:4px;">${r.notes || ""}</div>
          </div>`).join("")}
      </div>
    </div>`;
}

function detailItem(label, value) {
  return `
    <div class="detail-item">
      <div class="detail-label">${label}</div>
      <div>${value ?? "—"}</div>
    </div>`;
}

// ─── UTILITIES ────────────────────────────────────────────────────────────────

function prettify(text) {
  return text.replaceAll("_", " ").replace(/\b\w/g, c => c.toUpperCase());
}

function resetView() {
  relatedActive.clear();
  activeHighlights.clear();
  hoverHighlight = null;
  links.attr("stroke-opacity", 0);
  circles.attr("opacity", 1).attr("stroke-width", 1);

  simulation.alpha(0.5).restart();
}

function applySearch(query) {
  circles.attr("opacity", d => {
    if (!query) return 1;

    const haystack = [
      d.full_scripture,
      d.command_summary,
      d.semantic_domain,
      d.theological_theme,
      d.action_type
    ].join(" ").toLowerCase();

    return haystack.includes(query) ? 1 : 0.08;
  });
}