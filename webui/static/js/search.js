let allEntries = [];
let searchEntries = [];
let currentPage = 1;
let state = {
  query: "",
  field: "all",
  media: [],
  character: [],
  tags: [],
  type: "",
};

function entryTokens(entry) {
  if (!entry._tokens) {
    const label = `${entry.label} ${entry.realName || ""}`.trim();
    entry._tokens = FilterUtils ? FilterUtils.tokenizeLabel(label) : [];
  }
  return entry._tokens;
}

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
    const viewLink = I18n.withLang(
      `/view?label=${encodeURIComponent(entry.label)}`
    );
    card.innerHTML = `
      <div class="entry-title">${entry.label}</div>
      <div class="entry-meta">${entry.type} • ${App.formatBytes(entry.size)}</div>
      ${entry.realName ? `<div class="entry-meta">${entry.realName}</div>` : ""}
      <div class="entry-footer">
        <span class="badge">${entry.resourceType}</span>
        <a class="btn btn-sm btn-outline-dark" href="${viewLink}">${I18n.t("search.open")}</a>
      </div>
    `;
    container.appendChild(card);
  });

  renderPagination(totalPages);
  document.getElementById("searchSummary").textContent = I18n.t(
    "search.entries",
    { count: searchEntries.length }
  );
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

  container.appendChild(
    makeButton("Prev", Math.max(1, currentPage - 1), currentPage === 1)
  );
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
  container.appendChild(
    makeButton(
      "Next",
      Math.min(totalPages, currentPage + 1),
      currentPage === totalPages
    )
  );
}

function applyFilters() {
  let filtered = [...allEntries];

  if (state.type) {
    filtered = filtered.filter((entry) => entry.type === state.type);
  }

  if (window.FilterConfig && window.FilterUtils) {
    if (state.media.length > 0) {
      const mediaFilters = state.media
        .map((key) => FilterConfig.media.find((item) => item.key === key))
        .filter(Boolean);
      if (mediaFilters.length > 0) {
        filtered = filtered.filter((entry) => {
          const label = `${entry.label} ${entry.realName || ""}`.trim();
          const tokens = entryTokens(entry);
          return mediaFilters.some((filter) =>
            FilterUtils.matchLabel(label, filter, tokens)
          );
        });
      }
    }

    if (state.character.length > 0) {
      const charFilters = state.character
        .map((key) => FilterConfig.characters.find((item) => item.key === key))
        .filter(Boolean);
      if (charFilters.length > 0) {
        filtered = filtered.filter((entry) => {
          const label = `${entry.label} ${entry.realName || ""}`.trim();
          const tokens = entryTokens(entry);
          return charFilters.some((filter) =>
            FilterUtils.matchLabel(label, filter, tokens)
          );
        });
      }
    }

    if (state.tags.length > 0 && FilterConfig.tags) {
      const tagFilters = state.tags
        .map((key) => FilterConfig.tags.find((item) => item.key === key))
        .filter(Boolean);
      if (tagFilters.length > 0) {
        filtered = filtered.filter((entry) => {
          const label = `${entry.label} ${entry.realName || ""}`.trim();
          const tokens = entryTokens(entry);
          return tagFilters.some((filter) =>
            FilterUtils.matchLabel(label, filter, tokens)
          );
        });
      }
    }
  }

  searchEntries = filtered;
  sortEntries();
  renderResults();
}

function updateUrl() {
  const params = new URLSearchParams();
  params.set("lang", I18n.lang);
  if (state.query) {
    params.set("query", state.query);
  }
  if (state.field && state.field !== "all") {
    params.set("field", state.field);
  }
  if (state.media.length > 0) {
    params.set("media", state.media.join(","));
  }
  if (state.character.length > 0) {
    params.set("character", state.character.join(","));
  }
  if (state.tags.length > 0) {
    params.set("tags", state.tags.join(","));
  }
  if (state.type) {
    params.set("type", state.type);
  }
  const next = params.toString();
  window.history.replaceState(
    {},
    "",
    `${window.location.pathname}${next ? "?" + next : ""}`
  );
}

async function loadSearch() {
  const params = new URLSearchParams();
  params.set("lang", I18n.lang);
  if (state.query) {
    params.set("query", state.query);
  }
  if (state.field && state.field !== "all") {
    params.set("field", state.field);
  }
  const data = await App.apiGet(`/api/search?${params.toString()}`);
  allEntries = data;
  if (window.FilterUtils && FilterUtils.loadConfig) {
    await FilterUtils.loadConfig();
  }
  buildTypeFilter();
  applyFilters();
}

document.addEventListener("DOMContentLoaded", () => {
  hydrateStateFromUrl();
  const filtersReady =
    window.FilterUtils && FilterUtils.loadConfig
      ? FilterUtils.loadConfig()
      : Promise.resolve();
  filtersReady.then(renderFilterChips);
  setupSearchControls();
  document.getElementById("searchQuery").value = state.query;
  document.getElementById("searchField").value = state.field;
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
    document.getElementById("searchSummary").textContent = I18n.t(
      "search.failed"
    );
  });
});

function setupSearchControls() {
  document.getElementById("searchApply").addEventListener("click", () => {
    state.query = document.getElementById("searchQuery").value.trim();
    state.field = document.getElementById("searchField").value;
    updateUrl();
    loadSearch();
  });
  document.getElementById("searchClear").addEventListener("click", () => {
    state = {
      query: "",
      field: "all",
      media: [],
      character: [],
      tags: [],
      type: "",
    };
    document.getElementById("searchQuery").value = "";
    document.getElementById("searchField").value = "all";
    updateUrl();
    loadSearch();
    renderFilterChips();
  });
  document.getElementById("searchQuery").addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      document.getElementById("searchApply").click();
    }
  });
}

function hydrateStateFromUrl() {
  const params = new URLSearchParams(window.location.search);
  state.query =
    typeof initialQuery === "string" && initialQuery
      ? initialQuery
      : params.get("query") || "";
  state.field = params.get("field") || "all";
  state.media = parseParamList(params.get("media"));
  state.character = parseParamList(params.get("character"));
  state.tags = parseParamList(params.get("tags"));
  state.type = params.get("type") || "";
}

function parseParamList(value) {
  if (!value) {
    return [];
  }
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function renderFilterChips() {
  renderFilterGroup(
    document.getElementById("mediaFilters"),
    window.FilterConfig ? FilterConfig.media : [],
    state.media,
    (key) => toggleFilter("media", key)
  );

  renderFilterGroup(
    document.getElementById("characterFilters"),
    window.FilterConfig ? FilterConfig.characters : [],
    state.character,
    (key) => toggleFilter("character", key)
  );

  renderFilterGroup(
    document.getElementById("tagFilters"),
    window.FilterConfig && FilterConfig.tags ? FilterConfig.tags : [],
    state.tags,
    (key) => toggleFilter("tags", key)
  );
}

function toggleFilter(group, key) {
  if (!state[group]) {
    return;
  }
  const list = state[group];
  const index = list.indexOf(key);
  if (index >= 0) {
    list.splice(index, 1);
  } else {
    list.push(key);
  }
  updateUrl();
  applyFilters();
  renderFilterChips();
}

function renderFilterGroup(container, filters, activeKeys, onSelect) {
  if (!container) {
    return;
  }
  container.innerHTML = "";
  filters.forEach((filter) => {
    const button = document.createElement("button");
    button.type = "button";
    const isActive = Array.isArray(activeKeys) && activeKeys.includes(filter.key);
    button.className = `filter-chip${isActive ? " active" : ""}`;
    button.textContent = filter.labelKey
      ? I18n.t(filter.labelKey)
      : filter.label;
    button.addEventListener("click", () => onSelect(filter.key));
    container.appendChild(button);
  });
}

function buildTypeFilter() {
  const select = document.getElementById("typeFilter");
  if (!select) {
    return;
  }
  const types = Array.from(
    new Set(allEntries.map((entry) => entry.type).filter(Boolean))
  ).sort();
  select.innerHTML = `<option value="">${I18n.t("search.all")}</option>`;
  types.forEach((type) => {
    const option = document.createElement("option");
    option.value = type;
    option.textContent = type;
    select.appendChild(option);
  });
  if (state.type) {
    select.value = state.type;
  }
  select.onchange = () => {
    state.type = select.value;
    updateUrl();
    applyFilters();
  };
}
