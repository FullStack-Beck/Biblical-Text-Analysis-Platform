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

// Cache scales so refresh helpers can access them without rebuilding
let _colorScale = null;
let _shapeScale = null;

let hoverHighlight          = null;
let activeHighlights        = new Map();
let activeRelationshipTypes = new Set();
let relatedActive           = new Set();
let activeNodeKey = null;

// ─── SEARCH STATE ─────────────────────────────────────────────────────────────
let activeSearchTags = [];   // persistent pinned tags  [{ raw, terms[] }]
let liveSearchQuery  = "";   // ephemeral live text while typing

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
  d3.json("NodesCombinedValidated.json"),
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

  // ── Recompute counts from actual relationship data ────────────────────────
  // cross_reference_count  = total relationships touching this node
  // repetition_count       = relationships that are direct repetitions/echoes
  const REPETITION_TYPES = new Set([
    "direct_repeat", "thematic_repeat", "parallel_account",
    "restatement", "echo", "continuation"
  ]);

  const CROSS_REFERENCE_TYPES = new Set([
    "series_sequence", "quotation", "ot_reference", "ot_fulfillment", "prophetic_connection",
    "expansion", "restriction", "reversal", "intensification", "reinterpretation",
    "contrast", "cause_effect", "application", "summary", "covenant_transition", "allusion", 
    "typology", "fulfillment"
  ]);

  nodes.forEach(d => {
    const rels = relationshipMap.get(d.canonical_key) || [];
    d.cross_reference_count = rels.filter(r => CROSS_REFERENCE_TYPES.has(r.relationship_type)).length;
    d.repetition_count      = rels.filter(r => REPETITION_TYPES.has(r.relationship_type)).length;
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

  const searchInput = document.getElementById("searchInput");

  searchInput.addEventListener("input", e => {
    const raw = e.target.value;

    // If user typed a # tag followed by a space, auto-pin it
    const hashSpaceMatch = raw.match(/^(#\S+)\s$/);
    if (hashSpaceMatch) {
      pinSearchTag(hashSpaceMatch[1]);
      e.target.value = "";
      liveSearchQuery = "";
      updateHighlights();
      return;
    }

    liveSearchQuery = raw.toLowerCase();
    updateHighlights();
  });

  searchInput.addEventListener("keydown", e => {
    if (e.key === "Enter") {
      const raw = e.target.value.trim();
      if (!raw) return;
      pinSearchTag(raw.startsWith("#") ? raw : `#${raw}`);
      e.target.value = "";
      liveSearchQuery = "";
      updateHighlights();
    }
    // Backspace on empty input removes last tag
    if (e.key === "Backspace" && e.target.value === "" && activeSearchTags.length > 0) {
      activeSearchTags.pop();
      renderTagChips();
      updateHighlights();
    }
  });

  document.getElementById("toggleRelationshipBtn").onclick = () => {

    showAllRelationships = !showAllRelationships;
    const btn = document.getElementById("toggleRelationshipBtn");
    if (showAllRelationships) {
      activeNodeKey = null; // Clear any active node selection
    }

    toggleRelationshipVisibility();
  };

  buildRelationshipFilters();

  // Set initial max-heights so CSS transitions work correctly
  requestAnimationFrame(() => {
    ["color", "shape", "rel"].forEach(id => {
      const body = document.getElementById(`${id}LegendBody`);
      if (body) body.style.maxHeight = body.scrollHeight + 600 + "px";
    });
  });
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
  _colorScale  = scale;
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

  const activeSet = activeHighlights.get(field) || new Set();

  scale.domain().forEach(value => {
    const isActive = activeSet.has(value);
    const row = document.createElement("div");
    row.className = "legend-item" + (isActive ? " active" : "");
    row.dataset.field = field;
    row.dataset.value = value;
    row.innerHTML = `
      <div class="legend-color" style="background:${scale(value)}"></div>
      <div>${prettify(value)}</div>`;
    row.onmouseenter = () => { hoverHighlight = { field, value }; updateHighlights(); };
    row.onmouseleave = () => { hoverHighlight = null;             updateHighlights(); };
    row.onclick      = () => { toggleHighlight(field, value); refreshColorLegend(field, scale); };
    container.appendChild(row);
  });

  refreshLegendMeta("color", field, scale.domain());
}

function refreshColorLegend(field, scale) {
  const activeSet = activeHighlights.get(field) || new Set();
  document.querySelectorAll("#colorLegend .legend-item").forEach(row => {
    const v = row.dataset.value;
    row.classList.toggle("active", activeSet.has(v));
  });
  refreshLegendMeta("color", field, scale.domain());
}

function buildShapeLegend(field, scale) {
  const container = document.getElementById("shapeLegend");
  container.innerHTML = "";

  const activeSet = activeHighlights.get(field) || new Set();

  scale.domain().forEach(value => {
    const isActive = activeSet.has(value);
    const row = document.createElement("div");
    row.className = "legend-item" + (isActive ? " active" : "");
    row.dataset.field = field;
    row.dataset.value = value;

    const icon = document.createElement("div");
    icon.style.cssText = "width:18px;height:18px;display:flex;align-items:center;justify-content:center;flex-shrink:0;";

    const svg = d3.create("svg").attr("width", 18).attr("height", 18);
    svg.append("path")
      .attr("d", d3.symbol().type(scale(value)).size(70)())
      .attr("transform", "translate(9,9)")
      .attr("fill", "#cbd5e1");
    icon.appendChild(svg.node());

    const label = document.createElement("div");
    label.textContent = prettify(value);

    row.appendChild(icon);
    row.appendChild(label);

    row.onmouseenter = () => { hoverHighlight = { field, value }; updateHighlights(); };
    row.onmouseleave = () => { hoverHighlight = null;             updateHighlights(); };
    row.onclick = () => { toggleHighlight(field, value); refreshShapeLegend(field, scale); };

    container.appendChild(row);
  });

  refreshLegendMeta("shape", field, scale.domain());
}

function refreshShapeLegend(field, scale) {
  const activeSet = activeHighlights.get(field) || new Set();
  document.querySelectorAll("#shapeLegend .legend-item").forEach(row => {
    const v = row.dataset.value;
    row.classList.toggle("active", activeSet.has(v));
  });
  refreshLegendMeta("shape", field, scale.domain());
}

function toggleHighlight(field, value) {
  if (!activeHighlights.has(field)) activeHighlights.set(field, new Set());
  const set = activeHighlights.get(field);
  set.has(value) ? set.delete(value) : set.add(value);
  updateHighlights();
}

function updateHighlights() {
  circles.attr("opacity", d => {

    // ── 1. Relationship-based isolation (node click) ──────────────────────────
    if (relatedActive.size > 0) {
      if (!relatedActive.has(d.canonical_key)) return 0.06;
      // Still apply search filters on top of relationship highlight
    }

    // ── 2. Search filters (tags + live query) ────────────────────────────────
    const haystack = [
      d.full_scripture,
      d.command_summary,
      d.semantic_domain,
      d.theological_theme,
      d.action_type,
      d.book,
      d.speaker,
      d.covenant,
      d.literary_form,
      d.speech_act,
      d.audience_identity,
      d.polarity
    ].join(" ").toLowerCase();

    // All pinned tags must match (AND logic between tags)
    for (const tag of activeSearchTags) {
      const matchesTag = tag.terms.some(term => haystack.includes(term));
      if (!matchesTag) return relatedActive.size > 0 ? 0.06 : 0.06;
    }

    // Live query must also match if present
    if (liveSearchQuery && !haystack.includes(liveSearchQuery)) {
      return relatedActive.size > 0 ? 0.06 : 0.06;
    }

    // ── 3. Legend hover ───────────────────────────────────────────────────────
    if (hoverHighlight) {
      return d[hoverHighlight.field] === hoverHighlight.value ? 1 : 0.08;
    }

    // ── 4. Pinned legend filters ──────────────────────────────────────────────
    if (activeHighlights.size > 0) {
      for (const [field, values] of activeHighlights.entries())
        if (values.has(d[field])) return 1;
      return 0.08;
    }

    return 1;
  });

  // ── 5. When "show all" is on, re-filter links to match current visible set ──
  if (showAllRelationships) {
    const visibleKeys = getVisibleNodeKeys();
    links.attr("stroke-opacity", d => {
      if (!visibleKeys.has(d.source_key)) return 0;
      if (activeRelationshipTypes.size > 0 && !activeRelationshipTypes.has(d.relationship_type)) return 0;
      return 0.25;
    })
    .attr("stroke", d => relationshipColor(d.relationship_type));
  }
}

// ─── VISIBILITY HELPERS ───────────────────────────────────────────────────────

// Returns a Set of canonical_keys for nodes that pass ALL active filters:
//   • search tags + live query
//   • pinned legend highlights (color/shape)
// Does NOT consider relatedActive (relationship isolation) — that's separate.
function getVisibleNodeKeys() {
  const visible = new Set();

  nodes.forEach(d => {
    // ── Search filter ─────────────────────────────────────────────────────────
    const haystack = [
      d.full_scripture, d.command_summary, d.semantic_domain,
      d.theological_theme, d.action_type, d.book, d.speaker,
      d.covenant, d.literary_form, d.speech_act, d.audience_identity, d.polarity
    ].join(" ").toLowerCase();

    for (const tag of activeSearchTags) {
      if (!tag.terms.some(term => haystack.includes(term))) return;
    }
    if (liveSearchQuery && !haystack.includes(liveSearchQuery)) return;

    // ── Legend highlight filter ───────────────────────────────────────────────
    if (activeHighlights.size > 0) {
      let matchesAny = false;
      for (const [field, values] of activeHighlights.entries()) {
        if (values.has(d[field])) { matchesAny = true; break; }
      }
      if (!matchesAny) return;
    }

    visible.add(d.canonical_key);
  });

  return visible;
}

// ─── RELATIONSHIP HIGHLIGHTING ────────────────────────────────────────────────
function toggleRelationshipVisibility() {

  if (showAllRelationships) {

    relatedActive.clear(); // Clear any active relationship highlights

    circles.attr("opacity", 1); // Reset all nodes to full opacity

    // Only show links where BOTH endpoints pass the current filters
    const visibleKeys = getVisibleNodeKeys();

    links.attr("stroke-opacity", d => {
      if (!visibleKeys.has(d.source_key) || !visibleKeys.has(d.target_key)) return 0;
      if (activeRelationshipTypes.size > 0 && !activeRelationshipTypes.has(d.relationship_type)) return 0;
      return 0.25;
    })
    .attr("stroke", d => relationshipColor(d.relationship_type));

    // Re-apply node opacity so search/legend filters still dim non-matching nodes
    updateHighlights();
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
    series_sequence:        "#FFBE00",
    parallel_account:       "#FF6D00",
    quotation:              "#F8FF00",
    direct_repeat:          "#FA1C00",
    thematic_repeat:        "#FEFFCC",
    ot_reference:           "#ff0099",
    ot_fulfillment:         "#BE00FF",
    prophetic_connection:   "#0094FF",
    expansion:              "#0500FF",
    restriction:            "#00FFD2",
    contrast:               "#06FF00",
    cause_effect:           "#8C6900",
    application:            "#FFD6B8",
    summary:                "#ff8170",
    restatement:            "#FF99CB",
    covenant_transition:    "#69008C",
    echo:                   "#00518C",
    allusion:               "#808080",
    typology:               "#008C74",
    fulfillment:            "#9AD199",
    reversal:               "#C95D51",
    intensification:        "#CCE8E3",
    continuation:           "#B27DD1",
    reinterpretation:       "#ffffff"
  };
  return map[type] || "#64748b";
}

function buildRelationshipFilters() {
  const container = document.getElementById("relationshipFilters");
  container.innerHTML = "";
  const types = [...new Set(relationships.map(r => r.relationship_type))].sort();

  types.forEach(type => {
    const isActive = activeRelationshipTypes.has(type);
    const row = document.createElement("div");
    row.className = "legend-item" + (isActive ? " active" : "");
    row.dataset.reltype = type;
    row.innerHTML = `
      <div class="legend-color" style="background:${relationshipColor(type)}"></div>
      <div>${prettify(type)}</div>`;
    row.onclick = () => {
      activeRelationshipTypes.has(type)
        ? activeRelationshipTypes.delete(type)
        : activeRelationshipTypes.add(type);
      refreshRelLegend();
      toggleRelationshipVisibility();
    };
    container.appendChild(row);
  });

  refreshLegendMeta("rel", null, types);
}

function refreshRelLegend() {
  const types = [...new Set(relationships.map(r => r.relationship_type))].sort();
  document.querySelectorAll("#relationshipFilters .legend-item").forEach(row => {
    const t = row.dataset.reltype;
    row.classList.toggle("active", activeRelationshipTypes.has(t));
  });
  refreshLegendMeta("rel", null, types);
}

// ─── LEGEND COLLAPSIBLE + SELECT-ALL HELPERS ─────────────────────────────────

// Updates the badge count and Select All / Deselect All button text
function refreshLegendMeta(legendId, field, allValues) {
  const badge   = document.getElementById(`${legendId}LegendBadge`);
  const allBtn  = document.getElementById(`${legendId}AllBtn`);
  if (!badge || !allBtn) return;

  let selectedCount = 0;
  if (legendId === "rel") {
    selectedCount = activeRelationshipTypes.size;
  } else if (field) {
    selectedCount = (activeHighlights.get(field) || new Set()).size;
  }

  if (selectedCount > 0) {
    badge.textContent = selectedCount;
    badge.style.display = "inline-block";
  } else {
    badge.style.display = "none";
  }

  const allSelected = selectedCount === allValues.length;
  allBtn.textContent = allSelected ? "Deselect All" : "Select All";
}

// Collapse / expand a legend body
function toggleLegendSection(legendId) {
  const body    = document.getElementById(`${legendId}LegendBody`);
  const chevron = document.getElementById(`${legendId}Chevron`);
  if (!body) return;
  const isCollapsed = body.classList.toggle("collapsed");
  // Set max-height so the CSS transition works
  if (!isCollapsed) body.style.maxHeight = body.scrollHeight + "px";
  chevron?.classList.toggle("open", !isCollapsed);
}

// Select All / Deselect All for a legend group
function toggleAllLegend(legendId) {
  if (legendId === "color") {
    const field = currentColor;
    const scale = _colorScale || getColorScale(field);
    const allValues = scale.domain();
    const existing = activeHighlights.get(field) || new Set();
    if (existing.size === allValues.length) {
      activeHighlights.delete(field);
    } else {
      activeHighlights.set(field, new Set(allValues));
    }
    updateHighlights();
    refreshColorLegend(field, scale);

  } else if (legendId === "shape") {
    const field = currentShape;
    const scale = _shapeScale || getShapeScale(field);
    const allValues = scale.domain();
    const existing = activeHighlights.get(field) || new Set();
    if (existing.size === allValues.length) {
      activeHighlights.delete(field);
    } else {
      activeHighlights.set(field, new Set(allValues));
    }
    updateHighlights();
    refreshShapeLegend(field, scale);

  } else if (legendId === "rel") {
    const types = [...new Set(relationships.map(r => r.relationship_type))];
    if (activeRelationshipTypes.size === types.length) {
      activeRelationshipTypes.clear();
    } else {
      types.forEach(t => activeRelationshipTypes.add(t));
    }
    refreshRelLegend();
    toggleRelationshipVisibility();
  }
}

// ─── GROUPING ─────────────────────────────────────────────────────────────────

function setGroup(field) {
  currentGroup = field;
  const w = W();
  const h = H();

  // Always release any pinned positions from InOrder before switching layouts
  nodes.forEach(d => { d.fx = null; d.fy = null; });

  if (field === "InOrder") {
    const w = W();
    const h = H();

    const BOOK_ORDER = [
      "Genesis","Exodus","Leviticus","Numbers","Deuteronomy",
      "Joshua","Judges","Ruth","1 Samuel","2 Samuel",
      "1 Kings","2 Kings","1 Chronicles","2 Chronicles",
      "Ezra","Nehemiah","Esther","Job","Psalms","Proverbs",
      "Ecclesiastes","Song of Solomon","Isaiah","Jeremiah",
      "Lamentations","Ezekiel","Daniel","Hosea","Joel","Amos",
      "Obadiah","Jonah","Micah","Nahum","Habakkuk","Zephaniah",
      "Haggai","Zechariah","Malachi",
      "Matthew","Mark","Luke","John","Acts",
      "Romans","1 Corinthians","2 Corinthians","Galatians","Ephesians",
      "Philippians","Colossians","1 Thessalonians","2 Thessalonians",
      "1 Timothy","2 Timothy","Titus","Philemon","Hebrews",
      "James","1 Peter","2 Peter","1 John","2 John","3 John",
      "Jude","Revelation"
    ];

    const bookIndex = b => {
      const i = BOOK_ORDER.indexOf(b);
      return i === -1 ? 999 : i;
    };

    // Extract the trailing sub-index from canonical key e.g. gen_01_28_02 → 2
    const subIndex = key => parseInt(key.split("_").at(-1), 10) || 0;

    // Group by "Book|Chapter" so Genesis 1 and Exodus 1 are separate columns
    const chapterMap = new Map();
    nodes.forEach(d => {
      const colKey = `${d.book}|${d.chapter_start}`;
      if (!chapterMap.has(colKey)) chapterMap.set(colKey, []);
      chapterMap.get(colKey).push(d);
    });

    // Sort columns by canonical book order, then chapter number
    const columns = [...chapterMap.keys()].sort((a, b) => {
      const [bookA, chA] = a.split("|");
      const [bookB, chB] = b.split("|");
      const bookDiff = bookIndex(bookA) - bookIndex(bookB);
      return bookDiff !== 0 ? bookDiff : +chA - +chB;
    });

    // Sort nodes within each column by verse, then sub-index
    columns.forEach(col => {
      chapterMap.get(col).sort((a, b) =>
        a.verse_start !== b.verse_start
          ? a.verse_start - b.verse_start
          : subIndex(a.canonical_key) - subIndex(b.canonical_key)
      );
    });

    const topPadding  = 90;
    const nodeSpacing = 34;
    const colPadding  = 60;
    const colGap      = 25;   // gap between chapters in the same book
    const bookGap     = 55;  // double between books

    // Build column x-positions manually so book boundaries get extra space
    const colPositions = {};
    let cursor = colPadding;

    columns.forEach((col, i) => {
      colPositions[col] = cursor;

      if (i < columns.length - 1) {
        const [thisBook] = col.split("|");
        const [nextBook] = columns[i + 1].split("|");
        cursor += thisBook === nextBook ? colGap : bookGap;
      }
    });

    columns.forEach(col => {
      const x = columns.length === 1 ? w / 2 : colPositions[col];
      chapterMap.get(col).forEach((d, j) => {
        d.fx = x;
        d.fy = topPadding + j * nodeSpacing;
      });
    });

    // Draw labels
    const layer = d3.select("#labelsLayer");
    layer.selectAll("*").remove();

    // Chapter number above each column
    columns.forEach((col, i) => {
      const [, ch] = col.split("|");
      const x = columns.length === 1 ? w / 2 : colPositions[col];

      layer.append("text")
        .attr("x", x).attr("y", 50)
        .attr("text-anchor", "middle")
        .attr("fill", "#e2e8f0")
        .attr("font-size", "13px")
        .attr("font-weight", "700")
        .style("pointer-events", "none")
        .text(ch);
    });

    // Book name centered above its group of columns
    const bookGroups = new Map();
    columns.forEach((col, i) => {
      const [book] = col.split("|");
      if (!bookGroups.has(book)) bookGroups.set(book, []);
      bookGroups.get(book).push(col);
    });

    bookGroups.forEach((cols, book) => {
      const firstX  = colPositions[cols[0]];
      const lastX   = colPositions[cols[cols.length - 1]];
      const centerX = (firstX + lastX) / 2;

      layer.append("text")
        .attr("x", centerX)
        .attr("y", 22)
        .attr("text-anchor", "middle")
        .attr("fill", "#94a3b8")
        .attr("font-size", "11px")
        .attr("font-weight", "600")
        .attr("letter-spacing", "0.08em")
        .style("pointer-events", "none")
        .text(book.toUpperCase());
    });

    simulation
      .force("slice",     null)
      .force("groupX",    null)
      .force("groupY",    null)
      .force("center",    null)
      .force("x",         null)
      .force("y",         null)
      .force("charge",    d3.forceManyBody().strength(-4))
      .force("collision", d3.forceCollide().radius(d =>
        Math.sqrt(getNodeSize(d)) * 0.04 + 2
      ));

    simulation.alpha(0.4).restart();
    return;
  }


  if (field === "none") {

    nodes.forEach(d => { d.fx = null; d.fy = null; });
    d3.select("#labelsLayer")
      .selectAll("*")
      .remove();

    simulation
      .force("charge", d3.forceManyBody().strength(-25))
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
    .force("charge", d3.forceManyBody().strength(-25))
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
  _shapeScale = scale;

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
  // Only apply hover dim if no relationship isolation is active
  if (relatedActive.size === 0) {
    const rels = relationshipMap.get(node.canonical_key) || [];
    const connected = new Set([node.canonical_key, ...rels.map(r =>
      r.direction === "outgoing" ? r.target_key : r.source_key
    )]);
    hoverHighlight = null; // don't conflict with legend hover
    circles.attr("opacity", d => {
      // Respect search tags even during hover
      const haystack = [
        d.full_scripture, d.command_summary, d.semantic_domain,
        d.theological_theme, d.action_type, d.book, d.speaker,
        d.covenant, d.literary_form, d.speech_act, d.audience_identity, d.polarity
      ].join(" ").toLowerCase();

      for (const tag of activeSearchTags) {
        if (!tag.terms.some(term => haystack.includes(term))) return 0.04;
      }
      if (liveSearchQuery && !haystack.includes(liveSearchQuery)) return 0.04;

      return connected.has(d.canonical_key) ? 1 : 0.1;
    });
  }
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
  activeRelationshipTypes.clear();
  hoverHighlight = null;
  activeSearchTags = [];
  liveSearchQuery  = "";
  renderTagChips();
  document.getElementById("searchInput").value = "";
  links.attr("stroke-opacity", 0);
  circles.attr("opacity", 1).attr("stroke-width", 1);

  // Refresh legend UI to clear selected states
  if (_colorScale) refreshColorLegend(currentColor, _colorScale);
  if (_shapeScale) refreshShapeLegend(currentShape, _shapeScale);
  refreshRelLegend();

  simulation.alpha(0.5).restart();
}

// ─── SEARCH TAG HELPERS ───────────────────────────────────────────────────────

function pinSearchTag(raw) {
  // Normalize: strip leading #, split on | for OR within a tag
  const label = raw.replace(/^#+/, "");
  const terms  = label.toLowerCase().split("|").map(t => t.trim()).filter(Boolean);
  if (!terms.length) return;

  // Don't add duplicates
  const already = activeSearchTags.some(t => t.raw === raw);
  if (already) return;

  activeSearchTags.push({ raw, label, terms });
  renderTagChips();
}

function removeSearchTag(raw) {
  activeSearchTags = activeSearchTags.filter(t => t.raw !== raw);
  renderTagChips();
  updateHighlights();
}

function renderTagChips() {
  const container = document.getElementById("searchTagsContainer");
  container.innerHTML = "";
  activeSearchTags.forEach(tag => {
    const chip = document.createElement("div");
    chip.className = "search-tag";
    chip.innerHTML = `
      <span>#${tag.label}</span>
      <span class="tag-remove" title="Remove filter">✕</span>`;
    chip.querySelector(".tag-remove").onclick = () => removeSearchTag(tag.raw);
    container.appendChild(chip);
  });
}