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
  view: "grid",
  diffFrom: "",
  diffTo: "",
  diffApplied: false,
  diffStatus: "all",
};

let diffLookupToken = 0;
let diffFilterToken = 0;
let diffStatusCacheKey = "";
let diffStatusCache = new Map();
let perPageTouched = false;
const listViewAutoPerPage = 72;
const diffFilterYieldChunk = 1600;
let diffProgressToken = 0;
let diffProgressHideTimer = null;

function yieldToUI() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

function clearDiffProgressHideTimer() {
  if (diffProgressHideTimer) {
    clearTimeout(diffProgressHideTimer);
    diffProgressHideTimer = null;
  }
}

function setDiffProgressState(payload) {
  const root = document.getElementById("diffProgress");
  const textNode = document.getElementById("diffProgressText");
  const ratioNode = document.getElementById("diffProgressRatio");
  const fill = document.getElementById("diffProgressFill");
  if (!root || !textNode || !ratioNode || !fill) {
    return;
  }

  const {
    token,
    visible = false,
    text = I18n.t("search.diffProgressIdle"),
    loaded = 0,
    total = 0,
  } = payload || {};

  if (typeof token === "number" && token !== diffProgressToken) {
    return;
  }

  clearDiffProgressHideTimer();
  root.classList.toggle("d-none", !visible);
  textNode.textContent = text;

  const safeTotal = Number(total) > 0 ? Number(total) : 0;
  const safeLoaded = safeTotal > 0 ? Math.min(Math.max(Number(loaded) || 0, 0), safeTotal) : 0;
  ratioNode.textContent =
    safeTotal > 0
      ? `${App.formatNumber(safeLoaded)} / ${App.formatNumber(safeTotal)}`
      : "-";

  const percent = safeTotal > 0 ? Math.round((safeLoaded / safeTotal) * 100) : 0;
  fill.style.width = `${percent}%`;
  fill.setAttribute("aria-valuenow", `${percent}`);
}

function finalizeDiffProgress(token, text, loaded = 0, total = 0) {
  setDiffProgressState({
    token,
    visible: true,
    text,
    loaded,
    total,
  });
  diffProgressHideTimer = setTimeout(() => {
    if (token !== diffProgressToken) {
      return;
    }
    setDiffProgressState({
      token,
      visible: false,
      text: I18n.t("search.diffProgressIdle"),
      loaded: 0,
      total: 0,
    });
  }, 1200);
}

function normalizeDiffStatus(status) {
  if (status === "unchanged") {
    return "unchanged";
  }
  if (status === "modified") {
    return "modified";
  }
  if (status === "added") {
    return "added";
  }
  if (status === "removed") {
    return "removed";
  }
  if (status === "missing") {
    return "missing";
  }
  if (status === "error") {
    return "error";
  }
  return "unknown";
}

function renderDiffSummary(entries) {
  const node = document.getElementById("diffSummaryText");
  if (!node) {
    return;
  }

  if (!diffEnabled()) {
    node.textContent = I18n.t("search.diffSummaryDisabled");
    return;
  }

  const total = Array.isArray(entries) ? entries.length : 0;
  if (total <= 0) {
    node.textContent = I18n.t("search.diffSummaryEmpty");
    return;
  }

  const counts = {
    unchanged: 0,
    modified: 0,
    added: 0,
    removed: 0,
    missing: 0,
    error: 0,
  };

  let known = 0;
  entries.forEach((entry) => {
    const status = normalizeDiffStatus(diffStatusCache.get(entry.label));
    if (status === "unknown") {
      return;
    }
    known += 1;
    if (status in counts) {
      counts[status] += 1;
    } else {
      counts.error += 1;
    }
  });

  if (known <= 0) {
    node.textContent = I18n.t("search.diffSummaryPending", {
      total: App.formatNumber(total),
    });
    return;
  }

  node.textContent = I18n.t("search.diffSummary", {
    known: App.formatNumber(known),
    total: App.formatNumber(total),
    unchanged: App.formatNumber(counts.unchanged),
    modified: App.formatNumber(counts.modified),
    added: App.formatNumber(counts.added),
    removed: App.formatNumber(counts.removed),
    missing: App.formatNumber(counts.missing),
    error: App.formatNumber(counts.error),
  });
}

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
      left = (left || "").toLowerCase();
      right = (right || "").toLowerCase();
    } else if (sortBy === "modifiedAt") {
      left = Number(left || 0);
      right = Number(right || 0);
      const leftMissing = left <= 0;
      const rightMissing = right <= 0;
      if (leftMissing && !rightMissing) {
        return 1;
      }
      if (!leftMissing && rightMissing) {
        return -1;
      }
    } else if (typeof left === "string" || typeof right === "string") {
      left = (left || "").toString().toLowerCase();
      right = (right || "").toString().toLowerCase();
    } else {
      left = Number(left || 0);
      right = Number(right || 0);
    }
    if (left < right) {
      return sortDir === "asc" ? -1 : 1;
    }
    if (left > right) {
      return sortDir === "asc" ? 1 : -1;
    }
    const tieLabelA = (a.label || "").toLowerCase();
    const tieLabelB = (b.label || "").toLowerCase();
    if (tieLabelA < tieLabelB) {
      return -1;
    }
    if (tieLabelA > tieLabelB) {
      return 1;
    }
    return 0;
  });
}

function needsModifiedTime() {
  const sortBy = document.getElementById("sortBy");
  return sortBy && sortBy.value === "modifiedAt";
}

function formatModifiedAt(timestamp) {
  if (!timestamp) {
    return "";
  }
  const date = new Date(timestamp * 1000);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleString();
}

function diffSelectionValid() {
  return Boolean(
    state.diffFrom &&
      state.diffTo &&
      state.diffFrom !== state.diffTo
  );
}

function diffEnabled() {
  return diffSelectionValid() && Boolean(state.diffApplied);
}

function currentDiffKey() {
  if (!diffSelectionValid()) {
    return "";
  }
  return `${state.diffFrom}::${state.diffTo}`;
}

function resetDiffCacheIfNeeded() {
  const nextKey = currentDiffKey();
  if (nextKey === diffStatusCacheKey) {
    return;
  }
  diffStatusCacheKey = nextKey;
  diffStatusCache = new Map();
}

function statusMatchesFilter(status) {
  if (state.diffStatus === "all") {
    return true;
  }
  return status === state.diffStatus;
}

async function ensureDiffStatuses(labels, options = {}) {
  const shouldStop =
    options && typeof options.shouldStop === "function"
      ? options.shouldStop
      : null;
  const onProgress =
    options && typeof options.onProgress === "function"
      ? options.onProgress
      : null;

  if (!diffEnabled()) {
    return { complete: true, failedBatches: 0, cancelled: false, loaded: 0, total: 0 };
  }

  if (shouldStop && shouldStop()) {
    return { complete: false, failedBatches: 0, cancelled: true, loaded: 0, total: 0 };
  }

  resetDiffCacheIfNeeded();
  const unique = Array.from(new Set(labels.filter(Boolean)));
  const missing = unique.filter((label) => !diffStatusCache.has(label));
  const total = missing.length;
  if (!missing.length) {
    return { complete: true, failedBatches: 0, cancelled: false, loaded: 0, total: 0 };
  }

  const batchSize = 500;
  const maxConcurrent = 6;
  const batches = [];
  for (let i = 0; i < missing.length; i += batchSize) {
    batches.push(missing.slice(i, i + batchSize));
  }

  if (onProgress) {
    onProgress({ phase: "prepare", loaded: 0, total, failedBatches: 0 });
  }

  let failedBatches = 0;
  let loaded = 0;
  for (let i = 0; i < batches.length; i += maxConcurrent) {
    if (shouldStop && shouldStop()) {
      return { complete: false, failedBatches, cancelled: true, loaded, total };
    }
    const slice = batches.slice(i, i + maxConcurrent);
    const results = await Promise.all(
      slice.map(async (chunk) => {
        if (shouldStop && shouldStop()) {
          return "cancelled";
        }
        try {
          const data = await App.apiPost("/api/masterdata/diff/lookup", {
            from: state.diffFrom,
            to: state.diffTo,
            labels: chunk,
          });
          const items = data.items || {};
          chunk.forEach((label) => {
            diffStatusCache.set(
              label,
              normalizeDiffStatus((items[label] || {}).status || "missing")
            );
          });
          return "ok";
        } catch (err) {
          chunk.forEach((label) => {
            if (!diffStatusCache.has(label)) {
              diffStatusCache.set(label, "error");
            }
          });
          return "failed";
        }
      })
    );
    results.forEach((result, idx) => {
      if (result !== "cancelled") {
        loaded += slice[idx].length;
      }
      if (result === "failed") {
        failedBatches += 1;
      }
    });
    if (onProgress) {
      onProgress({
        phase: "loading",
        loaded: Math.min(loaded, total),
        total,
        failedBatches,
      });
    }
    await yieldToUI();
  }

  return {
    complete: failedBatches === 0,
    failedBatches,
    cancelled: false,
    loaded,
    total,
  };
}

function diffLabelFromStatus(status) {
  if (status === "unchanged") {
    return I18n.t("search.diffUnchanged");
  }
  if (status === "missing") {
    return I18n.t("search.diffMissing");
  }
  if (status === "error") {
    return I18n.t("search.diffFailed");
  }
  const key = `master.diffStatus.${status || "unknown"}`;
  return I18n.t(key);
}

function applyDiffChip(node, status) {
  if (!node) {
    return;
  }
  const normalized = status || "unknown";
  node.className = `badge search-diff-chip search-diff-${normalized}`;
  node.textContent = diffLabelFromStatus(normalized);
}

async function refreshVisibleEntryDiffs(pageEntries) {
  const chips = document.querySelectorAll(".search-diff-chip[data-label]");
  if (!chips.length) {
    return;
  }

  if (!diffEnabled()) {
    chips.forEach((node) => {
      node.className = "badge search-diff-chip search-diff-disabled";
      node.textContent = I18n.t("search.diffDisabled");
    });
    renderDiffSummary(searchEntries);
    return;
  }

  chips.forEach((node) => {
    node.className = "badge search-diff-chip search-diff-loading";
    node.textContent = I18n.t("search.diffLoading");
  });

  const labels = pageEntries.map((entry) => entry.label).filter(Boolean);
  if (!labels.length) {
    return;
  }

  const token = ++diffLookupToken;
  try {
    const lookup = await ensureDiffStatuses(labels, {
      shouldStop: () => token !== diffLookupToken,
    });
    if (lookup.cancelled) {
      return;
    }
    if (token !== diffLookupToken) {
      return;
    }
    chips.forEach((node) => {
      const label = node.dataset.label;
      applyDiffChip(node, normalizeDiffStatus(diffStatusCache.get(label) || "missing"));
    });
    renderDiffSummary(searchEntries);
  } catch (err) {
    if (token !== diffLookupToken) {
      return;
    }
    chips.forEach((node) => {
      node.className = "badge search-diff-chip search-diff-error";
      node.textContent = I18n.t("search.diffFailed");
    });
    renderDiffSummary(searchEntries);
  }
}

function renderResults() {
  const container = document.getElementById("searchResults");
  container.className = `result-grid${state.view === "list" ? " list-view" : ""}`;
  const perPage = parseInt(document.getElementById("entriesPerPage").value, 10);
  const totalPages = Math.max(1, Math.ceil(searchEntries.length / perPage));
  currentPage = Math.min(currentPage, totalPages);
  const start = (currentPage - 1) * perPage;
  const pageEntries = searchEntries.slice(start, start + perPage);

  container.innerHTML = "";
  pageEntries.forEach((entry) => {
    const card = document.createElement("div");
    card.className = "entry-card";
    const viewParams = new URLSearchParams();
    viewParams.set("label", entry.label);
    if (state.diffFrom) {
      viewParams.set("diffFrom", state.diffFrom);
    }
    if (state.diffTo) {
      viewParams.set("diffTo", state.diffTo);
    }
    const viewLink = I18n.withLang(`/view?${viewParams.toString()}`);
    const extraMetaParts = [];
    if (entry.realName) {
      extraMetaParts.push(entry.realName);
    }
    const modifiedText = formatModifiedAt(entry.modifiedAt);
    if (modifiedText) {
      extraMetaParts.push(`${I18n.t("search.modifiedShort")}: ${modifiedText}`);
    }
    card.innerHTML = `
      <div class="entry-title">${entry.label}</div>
      <div class="entry-meta">${entry.type} • ${App.formatBytes(entry.size)}</div>
      ${
        extraMetaParts.length
          ? `<div class="entry-meta entry-meta-secondary">${extraMetaParts.join(
              " • "
            )}</div>`
          : ""
      }
      <div class="entry-footer">
        <div class="entry-badges">
          <span class="badge">${entry.resourceType}</span>
          <span class="badge search-diff-chip search-diff-disabled" data-label="${
            entry.label
          }">${I18n.t("search.diffDisabled")}</span>
        </div>
        <a class="btn btn-sm btn-outline-dark" href="${viewLink}" target="_blank" rel="noopener noreferrer">${I18n.t(
          "search.open"
        )}</a>
      </div>
    `;
    container.appendChild(card);
  });

  document.getElementById("searchSummary").textContent = I18n.t(
    "search.entries",
    { count: searchEntries.length }
  );
  renderDiffSummary(searchEntries);
  renderPagination(totalPages);
  refreshVisibleEntryDiffs(pageEntries);
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
    makeButton(
      I18n.t("search.pagePrev"),
      Math.max(1, currentPage - 1),
      currentPage === 1
    )
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
      I18n.t("search.pageNext"),
      Math.min(totalPages, currentPage + 1),
      currentPage === totalPages
    )
  );
}

async function applyFilters() {
  const token = ++diffFilterToken;
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
          return mediaFilters.every((filter) =>
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
          return charFilters.every((filter) =>
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
          return tagFilters.every((filter) =>
            FilterUtils.matchLabel(label, filter, tokens)
          );
        });
      }
    }
  }

  if (diffEnabled() && state.diffStatus !== "all") {
    diffProgressToken = token;
    setDiffProgressState({
      token,
      visible: true,
      text: I18n.t("search.diffProgressPrepare"),
      loaded: 0,
      total: filtered.length,
    });

    const ensureResult = await ensureDiffStatuses(filtered.map((entry) => entry.label), {
      shouldStop: () => token !== diffFilterToken,
      onProgress: (progress) => {
        if (token !== diffFilterToken) {
          return;
        }
        if (progress.phase === "prepare") {
          setDiffProgressState({
            token,
            visible: true,
            text: I18n.t("search.diffProgressPrepare"),
            loaded: progress.loaded,
            total: progress.total,
          });
          return;
        }
        setDiffProgressState({
          token,
          visible: true,
          text: I18n.t("search.diffProgressLoading", {
            loaded: App.formatNumber(progress.loaded),
            total: App.formatNumber(progress.total),
          }),
          loaded: progress.loaded,
          total: progress.total,
        });
      },
    });
    if (token !== diffFilterToken || ensureResult.cancelled) {
      if (token === diffProgressToken) {
        setDiffProgressState({
          token,
          visible: false,
          text: I18n.t("search.diffProgressCancelled"),
          loaded: 0,
          total: 0,
        });
      }
      return;
    }

    const source = filtered;
    const totalSource = source.length;
    const next = [];
    for (let i = 0; i < source.length; i += 1) {
      const entry = source[i];
      const status = normalizeDiffStatus(diffStatusCache.get(entry.label) || "missing");
      if (statusMatchesFilter(status)) {
        next.push(entry);
      }
      const scanned = i + 1;
      if (scanned % diffFilterYieldChunk === 0 || scanned === totalSource) {
        if (token !== diffFilterToken) {
          return;
        }
        setDiffProgressState({
          token,
          visible: true,
          text: I18n.t("search.diffProgressFiltering", {
            loaded: App.formatNumber(scanned),
            total: App.formatNumber(totalSource),
          }),
          loaded: scanned,
          total: totalSource,
        });
        await yieldToUI();
      }
    }
    filtered = next;

    if (ensureResult.failedBatches > 0) {
      finalizeDiffProgress(
        token,
        I18n.t("search.diffProgressPartial", {
          failed: App.formatNumber(ensureResult.failedBatches),
        }),
        totalSource,
        totalSource
      );
    } else {
      finalizeDiffProgress(
        token,
        I18n.t("search.diffProgressDone", {
          count: App.formatNumber(ensureResult.total),
        }),
        totalSource,
        totalSource
      );
    }
  } else {
    if (token >= diffProgressToken) {
      diffProgressToken = token;
      setDiffProgressState({
        token,
        visible: false,
        text: I18n.t("search.diffProgressIdle"),
        loaded: 0,
        total: 0,
      });
    }
  }

  if (token !== diffFilterToken) {
    return;
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
  if (state.view && state.view !== "grid") {
    params.set("view", state.view);
  }
  if (state.diffFrom) {
    params.set("diffFrom", state.diffFrom);
  }
  if (state.diffTo) {
    params.set("diffTo", state.diffTo);
  }
  if (state.diffApplied && diffSelectionValid()) {
    params.set("diff", "1");
  }
  if (state.diffStatus && state.diffStatus !== "all") {
    params.set("diffStatus", state.diffStatus);
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
  if (needsModifiedTime()) {
    params.set("withModTime", "1");
  }
  const data = await App.apiGet(`/api/search?${params.toString()}`);
  allEntries = data;
  if (window.FilterUtils && FilterUtils.loadConfig) {
    await FilterUtils.loadConfig();
  }
  buildTypeFilter();
  await applyFilters();
}

function syncDiffControls() {
  const select = document.getElementById("diffStatus");
  const applyButton = document.getElementById("diffApply");
  const selected = diffSelectionValid();
  const enabled = diffEnabled();

  if (!enabled) {
    state.diffStatus = "all";
    if (select) {
      select.value = "all";
    }
  }
  if (select) {
    select.disabled = !enabled;
  }
  if (applyButton) {
    applyButton.disabled = !selected;
  }
}

function resetDiffCache() {
  diffStatusCacheKey = "";
  diffStatusCache = new Map();
}

async function applyDiffSelection(forceRefresh = false) {
  if (!diffSelectionValid()) {
    state.diffApplied = false;
    syncDiffControls();
    updateUrl();
    await applyFilters();
    return;
  }

  state.diffApplied = true;
  if (forceRefresh) {
    resetDiffCache();
  } else {
    resetDiffCacheIfNeeded();
  }
  syncDiffControls();
  updateUrl();
  await applyFilters();
}

function renderDiffVersionSelects(versions, current) {
  const fromSelect = document.getElementById("diffFromVersion");
  const toSelect = document.getElementById("diffToVersion");
  if (!fromSelect || !toSelect) {
    return;
  }

  fromSelect.innerHTML = "";
  toSelect.innerHTML = "";
  const disabledOption = document.createElement("option");
  disabledOption.value = "";
  disabledOption.textContent = I18n.t("search.diffDisabled");
  fromSelect.appendChild(disabledOption.cloneNode(true));
  toSelect.appendChild(disabledOption);

  if (!versions.length) {
    fromSelect.disabled = true;
    toSelect.disabled = true;
    state.diffFrom = "";
    state.diffTo = "";
    state.diffApplied = false;
    syncDiffControls();
    return;
  }

  const sorted = [...versions].sort((a, b) => b.version.localeCompare(a.version));
  sorted.forEach((item) => {
    const label = item.current
      ? `${item.version} (${I18n.t("master.currentTag")})`
      : item.version;
    const fromOpt = document.createElement("option");
    fromOpt.value = item.version;
    fromOpt.textContent = label;
    const toOpt = document.createElement("option");
    toOpt.value = item.version;
    toOpt.textContent = label;
    fromSelect.appendChild(fromOpt);
    toSelect.appendChild(toOpt);
  });

  fromSelect.disabled = false;
  toSelect.disabled = false;

  const hasFrom = sorted.some((item) => item.version === state.diffFrom);
  const hasTo = sorted.some((item) => item.version === state.diffTo);
  if (!hasTo) {
    state.diffTo = current || sorted[0].version;
  }
  if (!hasFrom) {
    const fallback = sorted.find((item) => item.version !== state.diffTo);
    state.diffFrom = fallback ? fallback.version : "";
  }

  fromSelect.value = state.diffFrom || "";
  toSelect.value = state.diffTo || "";
  if (!diffSelectionValid()) {
    state.diffApplied = false;
  }
  syncDiffControls();
}

async function loadDiffVersions() {
  const fromSelect = document.getElementById("diffFromVersion");
  const toSelect = document.getElementById("diffToVersion");
  if (!fromSelect || !toSelect) {
    return;
  }
  try {
    const data = await App.apiGet("/api/masterdata/versions");
    const versions = Array.isArray(data.versions) ? data.versions : [];
    renderDiffVersionSelects(versions, data.current || "");
    fromSelect.onchange = () => {
      state.diffFrom = fromSelect.value;
      state.diffApplied = false;
      resetDiffCacheIfNeeded();
      syncDiffControls();
      updateUrl();
      applyFilters().catch(() => {});
    };
    toSelect.onchange = () => {
      state.diffTo = toSelect.value;
      state.diffApplied = false;
      resetDiffCacheIfNeeded();
      syncDiffControls();
      updateUrl();
      applyFilters().catch(() => {});
    };
    if (allEntries.length > 0) {
      applyFilters().catch(() => {});
    }
  } catch (err) {
    fromSelect.innerHTML = `<option value="">${I18n.t("search.diffUnavailable")}</option>`;
    toSelect.innerHTML = `<option value="">${I18n.t("search.diffUnavailable")}</option>`;
    fromSelect.disabled = true;
    toSelect.disabled = true;
    state.diffFrom = "";
    state.diffTo = "";
    state.diffApplied = false;
    syncDiffControls();
  }
}

document.addEventListener("DOMContentLoaded", () => {
  hydrateStateFromUrl();
  const filtersReady =
    window.FilterUtils && FilterUtils.loadConfig
      ? FilterUtils.loadConfig()
      : Promise.resolve();
  filtersReady.then(renderFilterChips);
  setupSearchControls();
  syncDiffControls();
  loadDiffVersions();
  document.getElementById("searchQuery").value = state.query;
  document.getElementById("searchField").value = state.field;
  updateViewButtons();
  document.getElementById("viewGrid").addEventListener("click", () => {
    setViewMode("grid");
  });
  document.getElementById("viewList").addEventListener("click", () => {
    setViewMode("list");
  });
  document.getElementById("sortBy").addEventListener("change", () => {
    if (needsModifiedTime()) {
      loadSearch().catch(() => {
        document.getElementById("searchSummary").textContent = I18n.t(
          "search.failed"
        );
      });
      return;
    }
    sortEntries();
    renderResults();
  });
  document.getElementById("sortDir").addEventListener("change", () => {
    sortEntries();
    renderResults();
  });
  document.getElementById("entriesPerPage").addEventListener("change", () => {
    perPageTouched = true;
    currentPage = 1;
    renderResults();
  });
  adjustPerPageForView(state.view);
  loadSearch().catch(() => {
    document.getElementById("searchSummary").textContent = I18n.t(
      "search.failed"
    );
  });
});

function setupSearchControls() {
  const diffStatusSelect = document.getElementById("diffStatus");
  const diffApplyButton = document.getElementById("diffApply");
  if (diffStatusSelect) {
    diffStatusSelect.value = state.diffStatus || "all";
    diffStatusSelect.addEventListener("change", () => {
      state.diffStatus = diffStatusSelect.value || "all";
      currentPage = 1;
      updateUrl();
      applyFilters().catch(() => {});
    });
  }
  if (diffApplyButton) {
    diffApplyButton.addEventListener("click", () => {
      currentPage = 1;
      applyDiffSelection(true).catch(() => {});
    });
  }

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
      view: state.view,
      diffFrom: state.diffFrom,
      diffTo: state.diffTo,
      diffApplied: false,
      diffStatus: "all",
    };
    document.getElementById("searchQuery").value = "";
    document.getElementById("searchField").value = "all";
    if (diffStatusSelect) {
      diffStatusSelect.value = "all";
    }
    syncDiffControls();
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

function adjustPerPageForView(mode) {
  const select = document.getElementById("entriesPerPage");
  if (!select || mode !== "list" || perPageTouched) {
    return;
  }
  const current = parseInt(select.value, 10);
  if (!Number.isFinite(current) || current >= listViewAutoPerPage) {
    return;
  }
  const target = Array.from(select.options).find(
    (opt) => parseInt(opt.value, 10) >= listViewAutoPerPage
  );
  if (target) {
    select.value = target.value;
    currentPage = 1;
  }
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
  state.view = params.get("view") || "grid";
  state.diffFrom = params.get("diffFrom") || "";
  state.diffTo = params.get("diffTo") || "";
  state.diffApplied =
    params.get("diff") === "1" ||
    params.get("diff") === "true" ||
    params.get("diff") === "on";
  state.diffStatus = params.get("diffStatus") || "all";
  if (!state.diffApplied && state.diffStatus !== "all" && diffSelectionValid()) {
    state.diffApplied = true;
  }
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
  applyFilters().catch(() => {});
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
    applyFilters().catch(() => {});
  };
}

function setViewMode(mode) {
  state.view = mode;
  adjustPerPageForView(mode);
  currentPage = 1;
  updateUrl();
  renderResults();
  updateViewButtons();
}

function updateViewButtons() {
  const gridBtn = document.getElementById("viewGrid");
  const listBtn = document.getElementById("viewList");
  if (!gridBtn || !listBtn) {
    return;
  }
  gridBtn.classList.toggle("active", state.view !== "list");
  listBtn.classList.toggle("active", state.view === "list");
}
