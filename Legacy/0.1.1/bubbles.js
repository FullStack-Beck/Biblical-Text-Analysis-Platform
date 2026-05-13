let nodes = [];
let simulation;
let circles;

let currentGroup = "none";
let currentColor = "theological";

Papa.parse("data.tsv", {
  download: true,
  header: true,
  skipEmptyLines: true,
  complete: function(results) {

    nodes = results.data.map(d => ({
      book: d.book,
      theological: d.theological_domain,
      social: d.social_domain,
      action: d.action_domain,
      chapter: +d.chapter_start,
      verse: +d.verse_start,
      radius: 5
    }));

    init();
    buildLegend();
  }
});

function getCanvasSize() {
  const rect = document.getElementById("canvasContainer").getBoundingClientRect();
  return { width: rect.width, height: rect.height };
}

function init() {
  const { width, height } = getCanvasSize();

  const svg = d3.select("#canvas")
    .attr("width", width)
    .attr("height", height);

  if (svg.select("#labels").empty()) {
    svg.append("g").attr("id", "labels");
}

  circles = svg.selectAll("circle")
    .data(nodes)
    .enter()
    .append("circle")
    .attr("r", d => d.radius)
    .attr("fill", d => getColor(d, currentColor));

  circles.append("title")
    .text(d => `${d.book} ${d.chapter}:${d.verse}`);

  const padding = 8;

  simulation = d3.forceSimulation(nodes)
    .force("charge", d3.forceManyBody().strength(-5))
    .force("collision", d3.forceCollide().radius(6))
    .force("center", d3.forceCenter(width / 2, height / 2))
    .on("tick", () => {
      circles
        .attr("cx", d => d.x = Math.max(padding, Math.min(width - padding, d.x)))
        .attr("cy", d => d.y = Math.max(padding, Math.min(height - padding, d.y)))
        .attr("fill", d => getColor(d, currentColor));
    });
}

document.getElementById("colorSelect").addEventListener("change", e => {
  currentColor = e.target.value;
  updateColors();
  buildLegend();
});

function updateColors() {
  circles
    .transition()
    .duration(400)
    .attr("fill", d => getColor(d, currentColor));
}

function buildLegend() {
  const container = document.getElementById("legend");
  container.innerHTML = "";

  const values = [...new Set(nodes.map(d => d[currentColor]).filter(Boolean))];

  values.forEach(v => {
    const row = document.createElement("div");
    row.style.display = "flex";
    row.style.cursor = "pointer";

    const swatch = document.createElement("div");
    swatch.style.width = "12px";
    swatch.style.height = "12px";
    swatch.style.marginRight = "6px";
    swatch.style.background = getColor({ [currentColor]: v, book: v }, currentColor);

    const label = document.createElement("span");
    label.textContent = v;

    row.onclick = () => {
      circles.attr("opacity", d => d[currentColor] === v ? 1 : 0.1);
    };

    row.appendChild(swatch);
    row.appendChild(label);
    container.appendChild(row);
  });
}

function resetView() {
  circles.attr("opacity", 1);
}

function drawGroupLabels(groups, positions) {
  const svg = d3.select("#canvas");

  let labelLayer = svg.select("#labels");

  if (labelLayer.empty()) {
    labelLayer = svg.append("g").attr("id", "labels");
  }

  // clear old labels
  labelLayer.selectAll("text").remove();

  labelLayer.selectAll("text")
    .data(groups)
    .enter()
    .append("text")
    .attr("x", g => positions[g].x)
    .attr("y", g => positions[g].y - 40) // above cluster
    .attr("text-anchor", "middle")
    .attr("fill", "#94a3b8")
    .attr("font-size", "12px")
    .text(g => g);
}

function buildSlices(type) {
  const groups = [...new Set(nodes.map(d => d[type]).filter(Boolean))];

  // group sizes
  const counts = {};
  groups.forEach(g => counts[g] = 0);
  nodes.forEach(d => counts[d[type]]++);

  // sort biggest first
  groups.sort((a, b) => counts[b] - counts[a]);

  const total = groups.reduce((sum, g) => sum + counts[g], 0);

  const slices = {};

  let startAngle = 0;
  const gap = 0.02; // space between slices

  groups.forEach(g => {
    const ratio = counts[g] / total;
    const angleSize = ratio * Math.PI * 2;

    slices[g] = {
      start: startAngle + gap,
      end: startAngle + angleSize - gap
    };

    startAngle += angleSize;
  });

  return slices;
}

function drawSliceLabels(slices, cx, cy, radius) {
  const svg = d3.select("#canvas");
  let labelLayer = svg.select("#labels");

  if (labelLayer.empty()) {
    labelLayer = svg.append("g").attr("id", "labels");
  }

  labelLayer.selectAll("text").remove();

  Object.entries(slices).forEach(([g, s]) => {
    const angle = (s.start + s.end) / 2;

    labelLayer.append("text")
      .attr("x", cx + Math.cos(angle) * (radius + 80))
      .attr("y", cy + Math.sin(angle) * (radius + 80))
      .attr("text-anchor", "middle")
      .attr("fill", "#94a3b8")
      .attr("font-size", "12px")
      .text(g);
  });
}

function sliceForce(type, slices, cx, cy, radius) {
  return function(alpha) {

    nodes.forEach(d => {
      const g = d[type];
      if (!g || !slices[g]) return;

      const slice = slices[g];

      const angle = (slice.start + slice.end) / 2;

      const targetX = cx + Math.cos(angle) * radius;
      const targetY = cy + Math.sin(angle) * radius;

      // stable pull (NOT velocity injection)
      d.vx += (targetX - d.x) * 0.06 * alpha;
      d.vy += (targetY - d.y) * 0.06 * alpha;

      d.vx *= 0.85;
      d.vy *= 0.85;
    });
  };
}

function setGroup(type) {
  currentGroup = type;

  const { width, height } = getCanvasSize();

  if (type === "none") {
    simulation
      .force("x", d3.forceX(width / 2).strength(0.05))
      .force("y", d3.forceY(height / 2).strength(0.05))
      .force("collision", d3.forceCollide().radius(6))
      .force("slice", null);

    simulation.alpha(1).restart();
    return;
  }

  const slices = buildSlices(type);

  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width, height) * 0.32;

  simulation
    .force("slice", sliceForce(type, slices, cx, cy, radius))
    .force("center", d3.forceCenter(cx, cy).strength(0.03))
    .force("collision", d3.forceCollide().radius(6));

  drawSliceLabels(slices, cx, cy, radius);

  simulation.alpha(1).restart();
}

const colorMaps = {
  theological: {
    wisdom: "#3b82f6",
    ethics: "#22c55e",
    judgment: "#ef4444",
    worship: "#a855f7",
    prophecy: "#f59e0b",
    narrative: "#06b6d4",
    providence: "#10b981",
    law: "#f97316",
    covenant: "#eab308"
  },
  social: {
    individual: "#6366f1",
    family: "#ec4899",
    priesthood: "#8b5cf6",
    national: "#14b8a6",
    foreign_nations: "#f43f5e"
  },
  action: {
    moral_behavior: "#22c55e",
    ritual_behavior: "#a855f7",
    governance: "#f59e0b",
    warfare: "#ef4444",
    economic_behavior: "#10b981",
    construction: "#06b6d4",
    judicial: "#eab308",
    migration: "#3b82f6",
    communication: "#6366f1"
  }
};

const bookColors = {};

function getColor(d, mode) {
  if (mode === "book") {
    if (!bookColors[d.book]) {
      bookColors[d.book] = d3.interpolateRainbow(Math.random());
    }
    return bookColors[d.book];
  }

  return colorMaps[mode]?.[d[mode]] || "#64748b";
}

window.addEventListener("resize", () => {
  const { width, height } = getCanvasSize();

  d3.select("#canvas")
    .attr("width", width)
    .attr("height", height);

  simulation
    .force("center", d3.forceCenter(width / 2, height / 2))
    .alpha(1)
    .restart();
});