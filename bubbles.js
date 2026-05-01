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
  setGroup("none");
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

function setGroup(type) {
  currentGroup = type;
  window.setGroup = setGroup;
  window.resetView = resetView;

  const { width, height } = getCanvasSize();

  // 🔹 RESET MODE
  if (type === "none") {
    d3.select("#labels").selectAll("text").remove();

    simulation
      .force("x", d3.forceX(width / 2).strength(0.05))
      .force("y", d3.forceY(height / 2).strength(0.05))
      .force("collision", d3.forceCollide().radius(6));

    simulation.alpha(1).restart();
    return;
  }

  // 🔹 GET GROUPS
  const groups = [...new Set(nodes.map(d => d[type]).filter(Boolean))];

    // 🔹 CREATE GRID POSITIONS (FIXED + PADDED)
    const margin = 80; // 👈 tweak this for breathing room

    const usableWidth = width - margin * 2;
    const usableHeight = height - margin * 2;

    const cols = Math.ceil(Math.sqrt(groups.length));
    const rows = Math.ceil(groups.length / cols);

    const cellWidth = usableWidth / cols;
    const cellHeight = usableHeight / rows;

    const positions = {};

    groups.forEach((g, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);

        positions[g] = {
                x: margin + col * cellWidth + cellWidth / 2,
                y: margin + row * cellHeight + cellHeight / 2
        };
    });

  // 🔹 SPECIAL CASE: BOOK (ordered spiral inside clusters)
  if (type === "book") {
    const grouped = {};
    groups.forEach(g => grouped[g] = []);
    nodes.forEach(d => grouped[d.book]?.push(d));

    Object.values(grouped).forEach(arr =>
      arr.sort((a, b) => a.chapter - b.chapter || a.verse - b.verse)
    );

    groups.forEach(g => {
      const center = positions[g];
      const group = grouped[g];

      const perRow = Math.ceil(Math.sqrt(group.length));
      const spacing = 10;

        group.forEach((d, i) => {
            const col = i % perRow;
            const row = Math.floor(i / perRow);

            d.targetX = center.x + (col - perRow / 2) * spacing;
            d.targetY = center.y + (row - perRow / 2) * spacing;
        });
    });

    simulation
      .force("x", d3.forceX(d => d.targetX).strength(0.6))
      .force("y", d3.forceY(d => d.targetY).strength(0.6))
      .force("collision", d3.forceCollide().radius(6).strength(0.7));
  }

  // 🔹 NORMAL GROUPING
  else {
    simulation
      .force("x", d3.forceX(d => positions[d[type]].x).strength(0.4))
      .force("y", d3.forceY(d => positions[d[type]].y).strength(0.4))
      .force("collision", d3.forceCollide().radius(7));
  }

  // 🔹 LABELS
  drawGroupLabels(groups, positions);

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