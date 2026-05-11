let nodes = [];
let relationships = [];
let relationshipMap = new Map();

let simulation;
let circles;
let links;

let currentColor = "theological_theme";
let currentShape = "action_type";
let currentSize = "cross_reference_count";
let currentGroup = "none";

let hoverHighlight = null;
let activeHighlights = new Map();
let activeRelationshipTypes = new Set();
let relatedActive = new Set();

const BASE_SIZE = 120;

const AVAILABLE_FIELDS = [
  "book",
  "speaker",
  "source_authority",
  "audience_scope",
  "audience_role",
  "audience_identity",
  "covenant",
  "command_form",
  "authority_level",
  "polarity",
  "theological_theme",
  "literary_form",
  "action_type",
  "speech_act",
  "target_object",
  "semantic_domain",
  "translation_family",
  "language_source",
  "confidence"
];

Promise.all([
  d3.json("Genesis.json"),
  d3.json("GenesisR.json")
]).then(([nodeData, relationshipData]) => {

  nodes = nodeData.map(d => ({
    ...d,

    chapter_start: +d.chapter_start,
    verse_start: +d.verse_start,
    chapter_end: +d.chapter_end,
    verse_end: +d.verse_end,

    repetition_count: +d.repetition_count || 0,
    cross_reference_count: +d.cross_reference_count || 0,

    confidence_score:
      d.confidence === "high" ? 1 :
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

  document.getElementById("nodeCount").textContent = nodes.length;
  document.getElementById("relationshipCount").textContent = relationships.length;
});

function buildRelationshipMap() {
  relationshipMap.clear();

  relationships.forEach(rel => {

    if (!relationshipMap.has(rel.source_key)) {
      relationshipMap.set(rel.source_key, []);
    }

    relationshipMap.get(rel.source_key).push(rel);
  });
}

function initControls() {

  const colorSelect = document.getElementById("colorSelect");
  const shapeSelect = document.getElementById("shapeSelect");

  AVAILABLE_FIELDS.forEach(field => {

    const colorOption = document.createElement("option");
    colorOption.value = field;
    colorOption.textContent = prettify(field);
    colorSelect.appendChild(colorOption);

    const shapeOption = document.createElement("option");
    shapeOption.value = field;
    shapeOption.textContent = prettify(field);
    shapeSelect.appendChild(shapeOption);
  });

  colorSelect.value = currentColor;
  shapeSelect.value = currentShape;

  colorSelect.onchange = e => applyColors(e.target.value);
  shapeSelect.onchange = e => applyShapes(e.target.value);

  document.getElementById("groupSelect").onchange = e => {
    setGroup(e.target.value);
  };

  document.getElementById("sizeSelect").onchange = e => {
    applySizing(e.target.value);
  };

  document.getElementById("toggleBtn").onclick = () => {
    document.getElementById("controls").classList.toggle("open");
  };

  document.getElementById("closePanel").onclick = () => {
    document.getElementById("detailPanel").classList.remove("open");
  };

  document.getElementById("searchInput").addEventListener("input", e => {
    applySearch(e.target.value.toLowerCase());
  });

  buildRelationshipFilters();
}

function initVisualization() {

  const width = window.innerWidth;
  const height = window.innerHeight;

  const svg = d3.select("#canvas")
    .attr("width", width)
    .attr("height", height);

  svg.append("g").attr("id", "linksLayer");
  svg.append("g").attr("id", "nodesLayer");
  svg.append("g").attr("id", "labelsLayer");

  links = svg.select("#linksLayer")
    .selectAll("line")
    .data(relationships)
    .enter()
    .append("line")
    .attr("stroke", "#475569")
    .attr("stroke-opacity", 0)
    .attr("stroke-width", d => Math.max(1, d.strength * 3));

  circles = svg.select("#nodesLayer")
    .selectAll("path")
    .data(nodes)
    .enter()
    .append("path")
    .attr("fill", "#64748b")
    .attr("stroke", "#0f172a")
    .attr("stroke-width", 1)
    .style("cursor", "pointer")
    .on("click", (event, d) => {
      showDetails(d);
      highlightRelationships(d);
    })
    .on("mouseenter", (event, d) => {
      hoverNode(d);
    })
    .on("mouseleave", () => {
      clearHover();
    });

  circles.append("title")
    .text(d => `${d.book} ${d.chapter_start}:${d.verse_start}`);

  simulation = d3.forceSimulation(nodes)
    .force("charge", d3.forceManyBody().strength(-16))
    .force("center", d3.forceCenter(width / 2, height / 2))
    .force("collision", d3.forceCollide().radius(d => d.radius + 2))
    .on("tick", ticked);
}

function ticked() {

  circles.attr("transform", d => `translate(${d.x},${d.y})`);

  links
    .attr("x1", d => getNode(d.source_key)?.x || 0)
    .attr("y1", d => getNode(d.source_key)?.y || 0)
    .attr("x2", d => getNode(d.target_key)?.x || 0)
    .attr("y2", d => getNode(d.target_key)?.y || 0);
}

function getNode(key) {
  return nodes.find(n => n.canonical_key === key);
}

function getColorScale(field) {

  const values = [...new Set(nodes.map(d => d[field]).filter(Boolean))];

  return d3.scaleOrdinal()
    .domain(values)
    .range(d3.schemeTableau10.concat(d3.schemeSet3));
}

function applyColors(field) {

  currentColor = field;

  const scale = getColorScale(field);

  circles.transition()
    .duration(400)
    .attr("fill", d => scale(d[field] || "unknown"));

  buildColorLegend(field, scale);
}

function getShapeScale(field) {

  const values = [...new Set(nodes.map(d => d[field]).filter(Boolean))];

  const shapes = [
    d3.symbolCircle,
    d3.symbolSquare,
    d3.symbolTriangle,
    d3.symbolDiamond,
    d3.symbolCross,
    d3.symbolStar,
    d3.symbolWye
  ];

  return d3.scaleOrdinal()
    .domain(values)
    .range(shapes);
}

function applyShapes(field) {

  currentShape = field;

  const scale = getShapeScale(field);

  circles.transition()
    .duration(400)
    .attr("d", d => {

      const symbol = scale(d[field]) || d3.symbolCircle;

      return d3.symbol()
        .type(symbol)
        .size(getNodeSize(d))();
    });
}

function applySizing(field) {

  currentSize = field;

  circles.transition()
    .duration(400)
    .attr("d", d => {

      const shapeScale = getShapeScale(currentShape);
      const symbol = shapeScale(d[currentShape]) || d3.symbolCircle;

      return d3.symbol()
        .type(symbol)
        .size(getNodeSize(d))();
    });
}

function getNodeSize(d) {

  switch (currentSize) {

    case "cross_reference_count":
      return BASE_SIZE + (d.cross_reference_count * 25);

    case "repetition_count":
      return BASE_SIZE + (d.repetition_count * 35);

    case "confidence_score":
      return BASE_SIZE + (d.confidence_score * 250);

    default:
      return BASE_SIZE;
  }
}

function buildColorLegend(field, scale) {

  const container = document.getElementById("colorLegend");
  container.innerHTML = "";

  scale.domain().forEach(value => {

    const row = document.createElement("div");
    row.className = "legend-item";

    row.innerHTML = `
      <div class="legend-color" style="background:${scale(value)}"></div>
      <div>${value}</div>
    `;

    row.onmouseenter = () => {
      hoverHighlight = { field, value };
      updateHighlights();
    };

    row.onmouseleave = () => {
      hoverHighlight = null;
      updateHighlights();
    };

    row.onclick = () => {
      toggleHighlight(field, value);
    };

    container.appendChild(row);
  });
}

function toggleHighlight(field, value) {

  if (!activeHighlights.has(field)) {
    activeHighlights.set(field, new Set());
  }

  const set = activeHighlights.get(field);

  if (set.has(value)) {
    set.delete(value);
  } else {
    set.add(value);
  }

  updateHighlights();
}

function updateHighlights() {

  circles.attr("opacity", d => {

    if (relatedActive.size > 0) {
      return relatedActive.has(d.canonical_key) ? 1 : 0.08;
    }

    if (hoverHighlight) {
      return d[hoverHighlight.field] === hoverHighlight.value ? 1 : 0.1;
    }

    if (activeHighlights.size === 0) {
      return 1;
    }

    for (const [field, values] of activeHighlights.entries()) {
      if (values.has(d[field])) {
        return 1;
      }
    }

    return 0.1;
  });
}

function highlightRelationships(node) {

  relatedActive.clear();
  relatedActive.add(node.canonical_key);

  const rels = relationshipMap.get(node.canonical_key) || [];

  rels.forEach(rel => {
    relatedActive.add(rel.target_key);
  });

  updateHighlights();

  links
    .attr("stroke-opacity", d => {

      if (activeRelationshipTypes.size > 0 &&
          !activeRelationshipTypes.has(d.relationship_type)) {
        return 0;
      }

      return d.source_key === node.canonical_key ? 0.9 : 0;
    })
    .attr("stroke", d => relationshipColor(d.relationship_type));
}

function relationshipColor(type) {

  const map = {
    quotation: "#f59e0b",
    direct_repeat: "#10b981",
    thematic_repeat: "#3b82f6",
    fulfillment: "#ef4444",
    contrast: "#8b5cf6",
    typology: "#14b8a6",
    covenant_transition: "#f97316"
  };

  return map[type] || "#64748b";
}

function buildRelationshipFilters() {

  const container = document.getElementById("relationshipFilters");

  const types = [...new Set(
    relationships.map(r => r.relationship_type)
  )].sort();

  types.forEach(type => {

    const row = document.createElement("div");
    row.className = "legend-item";

    row.innerHTML = `
      <div class="legend-color"
           style="background:${relationshipColor(type)}"></div>
      <div>${type}</div>
    `;

    row.onclick = () => {

      if (activeRelationshipTypes.has(type)) {
        activeRelationshipTypes.delete(type);
      } else {
        activeRelationshipTypes.add(type);
      }
    };

    container.appendChild(row);
  });
}

function setGroup(field) {

  currentGroup = field;

  const width = window.innerWidth;
  const height = window.innerHeight;

  if (field === "none") {

    simulation
      .force("groupX", null)
      .force("groupY", null)
      .force("center", d3.forceCenter(width / 2, height / 2));

    simulation.alpha(1).restart();
    return;
  }

  const groups = [...new Set(nodes.map(d => d[field]).filter(Boolean))];

  const angleMap = {};

  groups.forEach((g, i) => {
    angleMap[g] = (i / groups.length) * Math.PI * 2;
  });

  const radius = Math.min(width, height) * 0.24;

  simulation
    .force("groupX", d3.forceX(d => {

      const angle = angleMap[d[field]] || 0;
      return width / 2 + Math.cos(angle) * radius;

    }).strength(0.12))

    .force("groupY", d3.forceY(d => {

      const angle = angleMap[d[field]] || 0;
      return height / 2 + Math.sin(angle) * radius;

    }).strength(0.12));

  simulation.alpha(1).restart();
}

function applySearch(query) {

  circles.attr("opacity", d => {

    if (!query) {
      return 1;
    }

    const haystack = `
      ${d.full_scripture}
      ${d.command_summary}
      ${d.semantic_domain}
      ${d.theological_theme}
      ${d.action_type}
    `.toLowerCase();

    return haystack.includes(query) ? 1 : 0.08;
  });
}

function hoverNode(node) {

  circles.attr("opacity", d => {

    if (d.canonical_key === node.canonical_key) {
      return 1;
    }

    const rels = relationshipMap.get(node.canonical_key) || [];

    const connected = rels.some(r => r.target_key === d.canonical_key);

    return connected ? 0.9 : 0.12;
  });
}

function clearHover() {
  updateHighlights();
}

function showDetails(d) {

  const panel = document.getElementById("detailPanel");
  const content = document.getElementById("detailContent");

  panel.classList.add("open");

  const rels = relationshipMap.get(d.canonical_key) || [];

  const html = `

    <h2>${d.book} ${d.chapter_start}:${d.verse_start}</h2>

    <div class="command-card">

      <div style="font-size:15px; line-height:1.6; margin-bottom:14px;">
        ${d.full_scripture}
      </div>

      <div style="font-size:14px; color:#cbd5e1; margin-bottom:16px;">
        ${d.command_summary || "No summary"}
      </div>

      <div class="detail-grid">

        ${detailItem("Speaker", d.speaker)}
        ${detailItem("Authority", d.source_authority)}
        ${detailItem("Audience Scope", d.audience_scope)}
        ${detailItem("Audience Identity", d.audience_identity)}
        ${detailItem("Audience Role", d.audience_role)}
        ${detailItem("Covenant", d.covenant)}
        ${detailItem("Command Form", d.command_form)}
        ${detailItem("Authority Level", d.authority_level)}
        ${detailItem("Polarity", d.polarity)}
        ${detailItem("Theme", d.theological_theme)}
        ${detailItem("Literary Form", d.literary_form)}
        ${detailItem("Action Type", d.action_type)}
        ${detailItem("Speech Act", d.speech_act)}
        ${detailItem("Target", d.target_object)}
        ${detailItem("Semantic Domain", d.semantic_domain)}
        ${detailItem("Translation", d.translation_source)}
        ${detailItem("Language", d.language_source)}
        ${detailItem("Confidence", d.confidence)}
        ${detailItem("Repetition Count", d.repetition_count)}
        ${detailItem("Cross References", d.cross_reference_count)}

      </div>

      <div style="margin-top:18px;">
        <div class="detail-label">Interpretation Notes</div>
        <div style="font-size:13px; line-height:1.6;">
          ${d.interpretation_notes || "None"}
        </div>
      </div>

      <div style="margin-top:18px;">
        <div class="detail-label">Relationships</div>

        ${rels.map(r => `
          <div style="margin-top:10px; background:#1e293b; padding:10px; border-radius:8px;">
            <div style="font-weight:bold; color:${relationshipColor(r.relationship_type)};">
              ${r.relationship_type}
            </div>
            <div style="font-size:12px; margin-top:4px;">
              → ${r.target_key}
            </div>
            <div style="font-size:12px; color:#94a3b8; margin-top:4px;">
              Strength: ${r.strength}
            </div>
            <div style="font-size:12px; margin-top:4px;">
              ${r.notes || ""}
            </div>
          </div>
        `).join("")}

      </div>

    </div>
  `;

  content.innerHTML = html;
}

function detailItem(label, value) {

  return `
    <div class="detail-item">
      <div class="detail-label">${label}</div>
      <div>${value || "—"}</div>
    </div>
  `;
}

function prettify(text) {
  return text
    .replaceAll("_", " ")
    .replace(/\b\w/g, c => c.toUpperCase());
}

function resetView() {

  relatedActive.clear();
  activeHighlights.clear();
  hoverHighlight = null;

  links.attr("stroke-opacity", 0);

  circles
    .attr("opacity", 1)
    .attr("stroke-width", 1);
}