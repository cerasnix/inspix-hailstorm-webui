let searchEntries = [];
let currentPage = 1;

function sortEntries() {
  const sortBy = document.getElementById("sortBy").value;
  const sortDir = document.getElementById("sortDir").value;
  searchEntries.sort((a, b) => {
    let left = a[sortBy];
    let right = b[sortBy];
    if (sortBy === "label") {
      left = left.toLowerCase();
      right = right.toLowerCase();
    }
    if (left < right) {
      return sortDir === "asc" ? -1 : 1;
    }
    if (left > right) {
      return sortDir === "asc" ? 1 : -1;
    }
    return 0;
  });
}

function renderResults() {
  const container = document.getElementById("searchResults");
  const perPage = parseInt(document.getElementById("entriesPerPage").value, 10);
  const totalPages = Math.max(1, Math.ceil(searchEntries.length / perPage));
  currentPage = Math.min(currentPage, totalPages);
  const start = (currentPage - 1) * perPage;
  const pageEntries = searchEntries.slice(start, start + perPage);

  container.innerHTML = "";
  pageEntries.forEach((entry) => {
    const card = document.createElement("div");
    card.className = "entry-card";
    card.innerHTML = `
      <div class="entry-title">${entry.label}</div>
      <div class="entry-meta">${entry.type} • ${App.formatBytes(entry.size)}</div>
      <div class="entry-footer">
        <span class="badge">${entry.resourceType}</span>
        <a class="btn btn-sm btn-outline-dark" href="/view?label=${encodeURIComponent(entry.label)}">Open</a>
      </div>
    `;
    container.appendChild(card);
  });

  renderPagination(totalPages);
  document.getElementById("searchSummary").textContent = `${searchEntries.length} entries`;
}

function renderPagination(totalPages) {
  const container = document.getElementById("pagination");
  container.innerHTML = "";
  const makeButton = (label, page, disabled) => {
    const btn = document.createElement("button");
    btn.textContent = label;
    btn.disabled = disabled;
    btn.addEventListener("click", () => {
      currentPage = page;
      renderResults();
    });
    return btn;
  };

  container.appendChild(makeButton("Prev", Math.max(1, currentPage - 1), currentPage === 1));
  for (let i = 1; i <= totalPages; i += 1) {
    if (i === 1 || i === totalPages || Math.abs(i - currentPage) <= 1) {
      container.appendChild(makeButton(i, i, i === currentPage));
    } else if (i === currentPage - 2 || i === currentPage + 2) {
      const span = document.createElement("span");
      span.textContent = "...";
      span.className = "text-muted";
      container.appendChild(span);
    }
  }
  container.appendChild(makeButton("Next", Math.min(totalPages, currentPage + 1), currentPage === totalPages));
}

async function loadSearch() {
  const query = typeof initialQuery === "string" ? initialQuery : "";
  const data = await App.apiGet(`/api/search?query=${encodeURIComponent(query)}`);
  searchEntries = data;
  sortEntries();
  renderResults();
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("sortBy").addEventListener("change", () => {
    sortEntries();
    renderResults();
  });
  document.getElementById("sortDir").addEventListener("change", () => {
    sortEntries();
    renderResults();
  });
  document.getElementById("entriesPerPage").addEventListener("change", () => {
    currentPage = 1;
    renderResults();
  });
  loadSearch().catch(() => {
    document.getElementById("searchSummary").textContent =
      "Failed to load catalog.";
  });
});
