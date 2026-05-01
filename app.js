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
      buildChart(data);
    }
  });

  const resizer = document.getElementById("resizer");
  const tableContainer = document.getElementById("tableContainer");

  let isDragging = false;

  resizer.addEventListener("mousedown", () => {
    isDragging = true;
  });

  document.addEventListener("mousemove", (e) => {
    if (!isDragging) return;

    const rect = tableContainer.getBoundingClientRect();
    const newHeight = e.clientY - rect.top;

    if (newHeight > 150 && newHeight < window.innerHeight * 0.8) {
      tableContainer.style.height = newHeight + "px";
    }
  });

  document.addEventListener("mouseup", () => {
    isDragging = false;
  });

  document.addEventListener("mousemove", (e) => {
  if (!isDragging) return;

  const rect = tableContainer.getBoundingClientRect();
  const newHeight = e.clientY - rect.top;

  if (newHeight > 150 && newHeight < window.innerHeight * 0.8) {
    tableContainer.style.height = newHeight + "px";

    // 🔥 force tabulator to re-render
    const table = Tabulator.findTable("#table")[0];
    if (table) table.redraw();
  }
});

  function multiSelectFilter(cell, onRendered, success, cancel, values) {

    const container = document.createElement("div");
    container.style.maxHeight = "120px";
    container.style.overflowY = "auto";
    container.style.padding = "4px";

    const selected = new Set();

    values.forEach(v => {
      const label = document.createElement("label");
      label.style.display = "block";
      label.style.cursor = "pointer";

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.value = v;

      checkbox.addEventListener("change", () => {
        if (checkbox.checked) {
          selected.add(v);
        } else {
          selected.delete(v);
        }
        success(Array.from(selected));
      });

      label.appendChild(checkbox);
      label.appendChild(document.createTextNode(" " + v));
      container.appendChild(label);
    });

    return container;
  }

  function multiSelectFilterFunc(headerValue, rowValue) {
    if (!headerValue || headerValue.length === 0) return true;
    return headerValue.includes(rowValue);
  }

  function buildTable(data) {

      const lookup = {
        theological: [...new Set(data.map(d => d.theological).filter(Boolean))],
        social: [...new Set(data.map(d => d.social).filter(Boolean))],
        action: [...new Set(data.map(d => d.action).filter(Boolean))]
      };

    const table = new Tabulator("#table", {
      data: data,
      layout: "fitColumns",
      height: "100%",

      columns: [
        {title: "Book", field: "book", headerFilter: true},
        {title: "Ch", field: "chapter", width: 60},
        {title: "V", field: "verse", width: 60},
        {title: "Command", field: "command", width: 420, headerFilter: true},
        {title: "Speaker", field: "speaker", width: 120, headerFilter: true},

        {title: "Theological", field: "theological", formatter: colorTag, headerFilter: (cell, onRendered, success, cancel) => multiSelectFilter(cell, onRendered, success, cancel, lookup.theological), headerFilterFunc: multiSelectFilterFunc},
        {title: "Social", field: "social", formatter: colorTag, headerFilter: (cell, onRendered, success, cancel) =>
    multiSelectFilter(cell, onRendered, success, cancel, lookup.social),
  headerFilterFunc: multiSelectFilterFunc},
        {title: "Action", field: "action", formatter: colorTag, headerFilter: (cell, onRendered, success, cancel) =>
    multiSelectFilter(cell, onRendered, success, cancel, lookup.action),
  headerFilterFunc: multiSelectFilterFunc},
        {title: "Status", field: "status", headerFilter: "select"},
      ],
    });

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