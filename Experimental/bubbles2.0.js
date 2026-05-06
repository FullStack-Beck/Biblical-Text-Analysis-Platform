let nodes = [];
let simulation;
let circles;

let relatedActive = new Set(); // track active related keys for multi-select

let currentColor = "theological"; // default mode
let currentShape = "action"; // track size mode

let activeHighlights = new Map(); // field → Set(values)
let hoverHighlight = null;    // temporary hover

const SHAPE_SIZE = 160; // tuned for visual balance (not data-driven)
const COLLISION_RADIUS = Math.sqrt(SHAPE_SIZE) * 1.1 + 4; // adds padding to prevent overlap

Papa.parse("DataV.3.tsv", {
  download: true,
  header: true,
  skipEmptyLines: true,
  transformHeader: h => h.trim(),
  complete: function(results) {

    nodes = results.data.map(d => ({
      book: d.book,
      chapter: +d.chapter_start,
      verse: +d.verse_start,
      text: d.full_scripture,
      summary: d.command_summary,

      theological: d.theological_theme,
      action: d.action_type,
      audience: d.audience_scope,
      polarity: d.polarity,
      authority: d.source_authority,

      key: d.canonical_key,
      related: d.related_key,

      radius: 5
    }));

    init();
    applyColors(currentColor);
  }
});
// 🔹 RESPONSIVE CANVAS
function getSize() {
  const rect = document.getElementById("canvasContainer").getBoundingClientRect();
  return { width: rect.width, height: rect.height };
}

// 🔹 SHAPE SYSTEM
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

function init() {
  // responsive canvas size
  const { width, height } = getSize();

  // main SVG layer
  const svg = d3.select("#canvas")
    .attr("width", width)
    .attr("height", height);

  // labels layer
  if (svg.select("#labels").empty()) {
    svg.append("g").attr("id", "labels");
  }

  // order labels layer (for grouping mode)
  if (svg.select("#orderLabels").empty()) {
    svg.append("g").attr("id", "orderLabels");
  }

  // 🔹 INITIAL CIRCLES (neutral color, tooltip only)
  circles = svg.selectAll("path")
    .data(nodes)
    .enter()
    .append("path")
    .attr("d", d3.symbol().type(d3.symbolCircle).size(SHAPE_SIZE))
    .attr("fill", "#64748b")
    .on("click", (event, d) => {
      showDetails(d);

      const chain = getOrderedChain(d);
      highlightOrderedChain(chain);
    });

  // tooltip
  circles.append("title")
    .text(d => `${d.book} ${d.chapter}:${d.verse}\n${d.text}`);

  // 🔹 FORCE SIMULATION (initially ungrouped, just a blob)
  simulation = d3.forceSimulation(nodes)
  .force("charge", d3.forceManyBody().strength(-6)) // smoother spread
  .force("collision", d3.forceCollide().radius(COLLISION_RADIUS))
  .force("center", d3.forceCenter(width / 2, height / 2))
  .on("tick", () => {
    circles.attr("transform", d => `translate(${d.x},${d.y})`);

    // 🔥 keep numbers attached to nodes
    d3.select("#orderLabels")
      .selectAll("text")
      .attr("x", d => d.x)
      .attr("y", d => d.y);
  });

}

//
// 🔹 RELATED NODES CHAIN (bidirectional traversal)
//

function getOrderedChain(startNode) {
  const visited = new Set();

  // 🔹 find TRUE START (walk backwards until no parent)
  let current = startNode;

  while (true) {
    const parent = nodes.find(n => n.key === current.related);
    if (!parent || visited.has(parent.key)) break;

    visited.add(current.key);
    current = parent;
  }

  // 🔹 now walk forward to build ordered list
  const chain = [];
  visited.clear();

  while (current && !visited.has(current.key)) {
    chain.push(current);
    visited.add(current.key);

    const next = nodes.find(n => n.related === current.key);
    current = next;
  }

  return chain;
}

//
// ✨ HIGHLIGHT SYSTEM (hover + click, multi-field support)
//

function updateHighlight() {
  circles.attr("opacity", d => {

    // 🔹 related highlight takes priority
    if (relatedActive.size > 0) {
      return relatedActive.has(d.key) ? 1 : 0.1;
    }

    // 🔹 hover
    if (hoverHighlight) {
      return d[hoverHighlight.field] === hoverHighlight.value ? 1 : 0.1;
    }

    // 🔹 checkbox filters
    if (activeHighlights.size === 0) return 1;

    for (let [field, values] of activeHighlights.entries()) {
      if (values.has(d[field])) return 1;
    }

    return 0.1;
  });
}

function toggleHighlight(field, value) {
  if (!activeHighlights.has(field)) {
    activeHighlights.set(field, new Set());
  }

  const set = activeHighlights.get(field);

  if (set.has(value)) {
    set.delete(value);
    if (set.size === 0) activeHighlights.delete(field);
  } else {
    set.add(value);
  }

  updateHighlight();
}

// 🔥 CHAIN HIGHLIGHT: emphasizes related nodes in order (numbers only)
function highlightOrderedChain(chain) {
  relatedActive.clear();

  // map key → order index
  const orderMap = new Map();
  chain.forEach((node, i) => {
    relatedActive.add(node.key);
    orderMap.set(node.key, i);
  });

  circles
    .transition()
    .duration(300)
    .attr("opacity", d => {
      if (relatedActive.size === 0) return 1;
      return relatedActive.has(d.key) ? 1 : 0.15;   // slightly darker dim
    })
    .attr("stroke", "none")           // ← removed white border
    .attr("stroke-width", 0)
    .attr("transform", d => {
      if (!relatedActive.has(d.key)) return `translate(${d.x},${d.y})`;

      // Optional: subtle scale increase for chain members
      const index = orderMap.get(d.key);
      const scale = 1 + index * 0.12;   // stronger size emphasis
      return `translate(${d.x},${d.y}) scale(${scale})`;
    });

  drawOrderLabels(chain);
}

//
// 🎨 COLOR SYSTEM
//

function getColorScale(field) {
  const values = [...new Set(nodes.map(d => d[field]).filter(Boolean))];

  return d3.scaleOrdinal()
    .domain(values)
    .range(d3.schemeTableau10);
}

function applyColors(field) {
  currentColor = field;

  const scale = getColorScale(field);

  circles
    .transition()
    .duration(400)
    .attr("fill", d => scale(d[field]));

  buildColorLegend(field, scale); // update legend with current scale
}

// 🔹 COLOR LEGEND BUILDER (shows color meaning based on current color mode)
function buildColorLegend(field, scale) {
  const container = document.getElementById("colorLegend");
  container.innerHTML = "";

  scale.domain().forEach(v => {
    const row = document.createElement("div");
    row.style.display = "flex";
    row.style.alignItems = "center";
    row.style.cursor = "pointer";

    const swatch = document.createElement("div");
    swatch.style.width = "12px";
    swatch.style.height = "12px";
    swatch.style.marginRight = "6px";
    swatch.style.background = scale(v);

    const label = document.createElement("span");
    label.textContent = v;

    // hover
    row.onmouseenter = () => {
      hoverHighlight = { field, value: v };
      updateHighlight();
    };

    row.onmouseleave = () => {
      hoverHighlight = null;
      updateHighlight();
    };

    // click = TOGGLE (checkbox behavior)
    row.onclick = () => toggleHighlight(field, v);

    row.appendChild(swatch);
    row.appendChild(label);
    container.appendChild(row);
  });
}

//
// shape system 
// 

function applyShapes(field) {
  const shapeScale = getShapeScale(field);

  circles
    .transition()
    .duration(400)
    .attr("d", d => {
      const shape = shapeScale(d[field]) || d3.symbolCircle;
      return d3.symbol().type(shape).size(SHAPE_SIZE)();
    });

  // 🔥 IMPORTANT: update collision to match shapes
  simulation.force(
    "collision",
    d3.forceCollide().radius(COLLISION_RADIUS)
  );

  simulation.alpha(1).restart();

  buildShapeLegend(field, shapeScale);
}

// 🔹 SHAPE LEGEND BUILDER (shows shape meaning based on current shape mode)
function buildShapeLegend(field, scale) {
  const container = document.getElementById("sizeLegend");
  container.innerHTML = "";

  scale.domain().forEach(v => {
    const row = document.createElement("div");

    // 🔥 FORCE CLEAN FLEX ROW
    row.style.display = "flex";
    row.style.alignItems = "center";
    row.style.justifyContent = "flex-start";
    row.style.gap = "8px";
    row.style.cursor = "pointer";
    row.style.marginBottom = "6px";

    // 🔥 ICON WRAPPER (prevents SVG weirdness)
    const icon = document.createElement("div");
    icon.style.width = "16px";
    icon.style.height = "16px";
    icon.style.display = "flex";
    icon.style.alignItems = "center";
    icon.style.justifyContent = "center";
    icon.style.flexShrink = "0";

    // 🔥 SVG (LOCKED SIZE)
    const svg = d3.create("svg")
      .attr("width", 16)
      .attr("height", 16)
      .style("display", "block"); // 🔥 removes inline spacing bug

    svg.append("path")
      .attr("d", d3.symbol().type(scale(v)).size(40)) // 🔥 SMALLER + FITS BOX
      .attr("transform", "translate(8,8)")
      .attr("fill", "#94a3b8");

    icon.appendChild(svg.node());

    // 🔥 LABEL (NO FLEX WEIRDNESS)
    const label = document.createElement("div");
    label.textContent = v;
    label.style.whiteSpace = "nowrap";
    label.style.fontSize = "12px";

    // hover
    row.onmouseenter = () => {
      hoverHighlight = { field, value: v };
      updateHighlight();
    };

    row.onmouseleave = () => {
      hoverHighlight = null;
      updateHighlight();
    };

    // click toggle
    row.onclick = () => {
      toggleHighlight(field, v);
      buildShapeLegend(field, scale); // refresh visual state
    };

    // 🔥 assemble
    row.appendChild(icon);
    row.appendChild(label);
    container.appendChild(row);
  });
}

//
// 🎛️ GLOBAL CONTROLS (call from HTML buttons/dropdown)
//

// 🔹 COLOR MODE
window.setColorMode = function(field) {
  applyColors(field);
};

// 🔹 SHAPE MODE
window.setSizeMode = function(field) {
  currentSize = field;
  applyShapes(field);
};

// 🔹 RESET VIEW (clear highlights and return to default state)
window.resetView = function() {
  activeHighlights.clear();
  hoverHighlight = null;
  relatedActive.clear();

  d3.select("#orderLabels").selectAll("text").remove();

  circles
    .transition()
    .duration(200)
    .attr("opacity", 1)
    .attr("stroke", "none")
    .attr("stroke-width", 0)
    .attr("transform", d => `translate(${d.x},${d.y})`);   // reset scale

  simulation.force("collision", d3.forceCollide().radius(COLLISION_RADIUS));
  simulation.alpha(1).restart();
};

//
// 🧩 TRUE CLUSTERING (single blob, clean internal separation)
//

let currentGroup = "none";

window.setGroup = function(field) {
  currentGroup = field;

  const { width, height } = getSize();
  const centerX = width / 2;
  const centerY = height / 2;

  // 🔹 RESET → pure blob
  if (field === "none") {
    simulation
      .force("center", d3.forceCenter(centerX, centerY))
      .force("groupX", null)
      .force("groupY", null)
      .force("collision", d3.forceCollide().radius(COLLISION_RADIUS))

    d3.select("#orderLabels").selectAll("text").remove();

    d3.select("#labels").selectAll("text").remove();
    simulation.alpha(1).restart();
    return;
  }

  // 🔹 GROUPS
  const groups = [...new Set(nodes.map(d => d[field]).filter(Boolean))];

  // 🔥 assign angle per group (stable + evenly spaced)
  const angleMap = {};
  const angleOffset = Math.PI / 2;

  // populate angle map based on group index
  groups.forEach((g, i) => {
    angleMap[g] = (i / groups.length) * 2 * Math.PI + angleOffset;
  });

  // 🔹 draw labels
  drawLabels(groups, angleMap);

  // 🔥 KEY FIXES:
  // - separation scales with canvas
  // - center is STRONGER than grouping
  // - grouping is subtle (prevents splitting into clusters)

  const baseRadius = Math.min(width, height) * 0.16; // adaptive spread
  const strength = 0.08; // small but noticeable

  simulation
    // 🔹 strong center = ONE blob
    .force("center", d3.forceCenter(centerX, centerY).strength(0.25))

    // 🔹 soft directional bias (not cluster anchors)
    .force("groupX", d3.forceX(d => {
      const angle = angleMap[d[field]] ?? 0;
      return angle
        ? centerX + Math.cos(angle) * baseRadius
        : centerX;
    }).strength(strength))

    .force("groupY", d3.forceY(d => {
      const angle = angleMap[d[field]] ?? 0;
      return angle
        ? centerY + Math.sin(angle) * baseRadius
        : centerY;
    }).strength(strength))

    // 🔹 collision keeps boundaries visible
    .force("collision", d3.forceCollide().radius(COLLISION_RADIUS))

  simulation.alpha(1).restart();
};

//
// 📝 LABEL DRAWING
//

function drawLabels(groups, angleMap) {
  const { width, height } = getSize();
  const centerX = width / 2;
  const centerY = height / 2;

  const labelRadius = Math.min(width, height) * 0.22; // distance from center to label (adaptive)

  const svg = d3.select("#canvas");
  const layer = svg.select("#labels");

  // clear old
  layer.selectAll("text").remove();

  layer.selectAll("text")
    .data(groups)
    .enter()
    .append("text")
    .attr("x", g => centerX + Math.cos(angleMap[g]) * labelRadius)
    .attr("y", g => centerY + Math.sin(angleMap[g]) * labelRadius)
    .attr("text-anchor", "middle")
    .attr("fill", "#94a3b8")
    .attr("font-size", "12px")
    .attr("pointer-events", "none") // 🔥 prevents interaction bugs
    .text(g => g);
}

// 🔹 ORDER LABELS (for related chain mode, shows order number in chain)
function drawOrderLabels(chain) {
  const svg = d3.select("#canvas");
  const layer = svg.select("#orderLabels");

  // 🔥 bring above nodes
  layer.raise();

  // clear old numbers
  layer.selectAll("text").remove();

  layer.selectAll("text")
    .data(chain)
    .enter()
    .append("text")
    .attr("text-anchor", "middle")
    .attr("dy", "0.35em")
    .attr("font-size", "24px")       // 🔥 bigger
    .attr("font-weight", "bold")     // 🔥 clearer
    .attr("fill", "#ffffff")
    .attr("stroke", "#000000")       // 🔥 outline for visibility
    .attr("stroke-width", "0.5px")
    .attr("pointer-events", "none")
    .text((d, i) => i + 1)
    .attr("x", d => d.x)
    .attr("y", d => d.y);
}

//
// 📋 DETAIL PANEL (shows full info on click)
//

function showDetails(d) {
  const panel = document.getElementById("detailPanel");
  const content = document.getElementById("detailContent");

  panel.classList.add("open");

  // Find ALL commands for this exact verse
  const verseCommands = nodes.filter(n => 
    n.book === d.book && 
    n.chapter === d.chapter && 
    n.verse === d.verse
  );

  // Sort them by their key (preserves original order)
  verseCommands.sort((a, b) => a.key.localeCompare(b.key));

  let html = `
    <h3>${d.book} ${d.chapter}:${d.verse}</h3>
  `;

  verseCommands.forEach((cmd, index) => {
    const polarityColor = cmd.polarity === "positive" ? "#22c55e" : 
                          cmd.polarity === "negative" ? "#ef4444" : "#94a3b8";

    html += `
      <div class="command-block" style="margin-bottom: 18px; padding: 12px; background: #1e2937; border-radius: 8px; border-left: 5px solid ${polarityColor};">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <strong style="color: ${polarityColor};">Command ${index + 1}</strong>
          <span style="font-size: 0.85em; color: #64748b;">
            ${cmd.action} • ${cmd.polarity}
          </span>
        </div>
        
        <div class="detail-row">
          <div class="detail-label">Scripture</div>
          <div style="line-height: 1.5;">${cmd.text}</div>
        </div>

        ${cmd.summary ? `
        <div class="detail-row">
          <div class="detail-label">Summary</div>
          <div>${cmd.summary}</div>
        </div>` : ''}

        <div class="detail-row">
          <div class="detail-label">Theme</div>
          ${cmd.theological}
        </div>

        <div class="detail-row">
          <div class="detail-label">Audience</div>
          ${cmd.audience}
        </div>
      </div>
    `;
  });

  content.innerHTML = html;
}

// close button
document.getElementById("closePanel").onclick = () => {
  document.getElementById("detailPanel").classList.remove("open");
};