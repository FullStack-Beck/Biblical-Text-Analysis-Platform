Papa.parse("data.tsv", {
  download: true,
  delimiter: "\t",
  header: true,
  skipEmptyLines: true,
  complete: function(results) {

    const rows = results.data;

    const data = rows.map(r => ({
      id: r.canonical_key,
      book: r.book,
      chapter: r.chapter_start,
      verse: r.verse_start,
      speaker: r.speaker,
      command: r.command_summary,
      theological: r.theological_domain,
      social: r.social_domain,
      action: r.action_domain,
      status: r.command_status
    }));

    buildTable(data);
    buildFilter(data);
    buildChart(data);
  }
});

function buildTable(data) {

  const table = new Tabulator("#table", {
    data: data,
    layout: "fitColumns",
    height: "500px",

    columns: [
      {title: "Book", field: "book", headerFilter: true},
      {title: "Ch", field: "chapter", width: 60},
      {title: "V", field: "verse", width: 60},
      {title: "Command", field: "command", width: 420, headerFilter: true},
      {title: "Speaker", field: "speaker", width: 120, headerFilter: true},

      {title: "Theological", field: "theological", formatter: colorTag},
      {title: "Social", field: "social", formatter: colorTag},
      {title: "Action", field: "action", formatter: colorTag},
      {title: "Status", field: "status", headerFilter: "select"},
    ],
  });

  buildFilter(data, table);
  buildChart(data);

}

function colorTag(cell) {
  const val = cell.getValue();
  const field = cell.getField();

  const maps = {
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

  const color = maps[field]?.[val] || "#64748b";

  return `<span style="
    background:${color};
    padding:2px 6px;
    border-radius:6px;
    font-size:11px;
    color:white;
  ">${val}</span>`;
}

function buildFilter(data, table) {
  const td = document.getElementById("tdFilter");
  const sd = document.getElementById("sdFilter");
  const ad = document.getElementById("adFilter");

  function fill(select, values) {
    select.innerHTML = '<option value="">All</option>';
    [...new Set(values)].forEach(v => {
      if (!v) return;
      const opt = document.createElement("option");
      opt.value = v;
      opt.text = v;
      select.appendChild(opt);
    });
  }

  fill(td, data.map(d => d.theological));
  fill(sd, data.map(d => d.social));
  fill(ad, data.map(d => d.action));

  function applyFilters() {
    const filters = [];
    if (td.value) filters.push({ field: "theological", value: td.value, type: "=" });
    if (sd.value) filters.push({ field: "social", value: sd.value, type: "=" });
    if (ad.value) filters.push({ field: "action", value: ad.value, type: "=" });
    table.setFilter(filters);
  }

  td.addEventListener("change", applyFilters);
  sd.addEventListener("change", applyFilters);
  ad.addEventListener("change", applyFilters);
}

function buildChart(data) {
  const counts = {};

  data.forEach(d => {
    const key = d.theological;
    if (!key) return;
    counts[key] = (counts[key] || 0) + 1;
  });

  new Chart(document.getElementById("chart"), {
    type: "bar",
    data: {
      labels: Object.keys(counts),
      datasets: [{
        label: "How many commands fall into each theological domain?",
        data: Object.values(counts)
      }]
    }
  });
}