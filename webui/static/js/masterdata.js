let masterFiles = [];
let activeName = null;

let currentVersion = "";
let versionOptions = [];
let diffItems = [];
let diffSummary = { total: 0, added: 0, removed: 0, modified: 0 };
let diffMeta = { total: 0, limit: 0, truncated: false };

function renderList() {
  const filterNode = document.getElementById("masterFilter");
  const list = document.getElementById("masterList");
  if (!filterNode || !list) {
    return;
  }
  const filter = filterNode.value.toLowerCase().trim();
  list.innerHTML = "";
  const filtered = masterFiles.filter((item) =>
    item.name.toLowerCase().includes(filter)
  );
  document.getElementById("masterCount").textContent = App.formatNumber(
    filtered.length
  );

  if (!filtered.length) {
    list.textContent = I18n.t("master.noFiles");
    return;
  }

  const frag = document.createDocumentFragment();
  filtered.forEach((item) => {
    const row = document.createElement("div");
    row.className = "list-item";
    if (item.name === activeName) {
      row.classList.add("active");
    }
    row.textContent = `${item.name} (${App.formatBytes(item.size)})`;
    row.addEventListener("click", () => selectFile(item.name));
    frag.appendChild(row);
  });
  list.appendChild(frag);
}

async function selectFile(name) {
  activeName = name;
  const preview = document.getElementById("masterPreview");
  if (!preview) {
    return;
  }
  preview.textContent = I18n.t("master.loading");

  try {
    const data = await fetch(`/api/masterdata/file?name=${encodeURIComponent(name)}`);
    if (!data.ok) {
      preview.textContent = I18n.t("master.failedLoad");
      return;
    }
    preview.textContent = await data.text();
    const download = document.getElementById("masterDownload");
    if (download) {
      download.setAttribute(
        "href",
        `/api/masterdata/file?name=${encodeURIComponent(name)}`
      );
    }
    renderList();
  } catch (err) {
    preview.textContent = I18n.t("master.failedLoad");
  }
}

async function loadMasterList() {
  try {
    masterFiles = await App.apiGet("/api/masterdata");
    renderList();
  } catch (err) {
    const list = document.getElementById("masterList");
    if (list) {
      list.textContent = I18n.t("master.failedList");
    }
  }
}

function renderDiffSummary(summary) {
  const safe = {
    total: summary?.total || 0,
    added: summary?.added || 0,
    removed: summary?.removed || 0,
    modified: summary?.modified || 0,
  };
  document.getElementById("diffTotal").textContent = App.formatNumber(safe.total);
  document.getElementById("diffAdded").textContent = App.formatNumber(safe.added);
  document.getElementById("diffRemoved").textContent = App.formatNumber(safe.removed);
  document.getElementById("diffModified").textContent = App.formatNumber(safe.modified);
}

function setDiffHint(key, vars) {
  const hint = document.getElementById("diffHint");
  if (!hint) {
    return;
  }
  hint.textContent = I18n.t(key, vars);
}

function renderVersionSelectOptions() {
  const fromSelect = document.getElementById("diffFromVersion");
  const toSelect = document.getElementById("diffToVersion");
  const runBtn = document.getElementById("diffRun");
  if (!fromSelect || !toSelect || !runBtn) {
    return;
  }

  const prevFrom = fromSelect.value;
  const prevTo = toSelect.value;
  fromSelect.innerHTML = "";
  toSelect.innerHTML = "";

  if (versionOptions.length === 0) {
    const empty = document.createElement("option");
    empty.value = "";
    empty.textContent = I18n.t("master.diffNoVersions");
    fromSelect.appendChild(empty.cloneNode(true));
    toSelect.appendChild(empty);
    fromSelect.disabled = true;
    toSelect.disabled = true;
    runBtn.disabled = true;
    return;
  }

  versionOptions.forEach((item) => {
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

  const defaultTo =
    versionOptions.find((item) => item.current)?.version ||
    versionOptions[0].version;

  if (prevTo && versionOptions.some((item) => item.version === prevTo)) {
    toSelect.value = prevTo;
  } else {
    toSelect.value = defaultTo;
  }

  if (prevFrom && versionOptions.some((item) => item.version === prevFrom)) {
    fromSelect.value = prevFrom;
  } else {
    const fallbackFrom = versionOptions.find(
      (item) => item.version !== toSelect.value
    );
    fromSelect.value = fallbackFrom ? fallbackFrom.version : toSelect.value;
  }

  if (fromSelect.value === toSelect.value) {
    const alternative = versionOptions.find((item) => item.version !== toSelect.value);
    if (alternative) {
      fromSelect.value = alternative.version;
    }
  }

  runBtn.disabled = versionOptions.length < 2;
}

function shortChecksum(value) {
  if (!value) {
    return "-";
  }
  if (value.length <= 14) {
    return value;
  }
  return `${value.slice(0, 7)}...${value.slice(-7)}`;
}

function describeDiffItem(item) {
  const from = item.from || null;
  const to = item.to || null;
  if (item.status === "added" && to) {
    return `${to.type} | ${App.formatBytes(to.size)} | +${shortChecksum(to.checksum)}`;
  }
  if (item.status === "removed" && from) {
    return `${from.type} | ${App.formatBytes(from.size)} | -${shortChecksum(from.checksum)}`;
  }
  if (!from || !to) {
    return "";
  }

  const typePart =
    from.type === to.type ? from.type : `${from.type} -> ${to.type}`;
  const sizePart =
    from.size === to.size
      ? App.formatBytes(to.size)
      : `${App.formatBytes(from.size)} -> ${App.formatBytes(to.size)}`;
  const checksumPart =
    from.checksum === to.checksum
      ? shortChecksum(to.checksum)
      : `${shortChecksum(from.checksum)} -> ${shortChecksum(to.checksum)}`;

  return `${typePart} | ${sizePart} | ${checksumPart}`;
}

function canOpenEntry(item) {
  if (item.status === "removed") {
    return false;
  }
  const toVersion = document.getElementById("diffToVersion")?.value;
  return Boolean(toVersion && toVersion === currentVersion);
}

function renderDiffList() {
  const list = document.getElementById("diffList");
  if (!list) {
    return;
  }
  const statusFilter = document.getElementById("diffStatusFilter")?.value || "all";
  const keyword = (document.getElementById("diffFilter")?.value || "")
    .toLowerCase()
    .trim();

  const filtered = diffItems.filter((item) => {
    if (statusFilter !== "all" && item.status !== statusFilter) {
      return false;
    }
    if (!keyword) {
      return true;
    }
    const haystack = [
      item.label,
      item.status,
      item.from?.type || "",
      item.to?.type || "",
      item.from?.realName || "",
      item.to?.realName || "",
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(keyword);
  });

  list.innerHTML = "";

  if (!diffItems.length) {
    list.textContent = I18n.t("master.diffEmpty");
    return;
  }

  if (!filtered.length) {
    list.textContent = I18n.t("master.diffNoMatch");
    return;
  }

  const frag = document.createDocumentFragment();
  filtered.forEach((item) => {
    const row = document.createElement("div");
    row.className = `diff-item diff-item-${item.status || "unknown"}`;

    const titleRow = document.createElement("div");
    titleRow.className = "diff-item-title";

    const label = document.createElement("code");
    label.className = "diff-item-label";
    label.textContent = item.label;

    const status = document.createElement("span");
    status.className = `diff-status diff-status-${item.status || "unknown"}`;
    status.textContent = I18n.t(`master.diffStatus.${item.status || "unknown"}`);

    titleRow.appendChild(label);
    titleRow.appendChild(status);

    const meta = document.createElement("div");
    meta.className = "diff-item-meta";
    meta.textContent = describeDiffItem(item);

    row.appendChild(titleRow);
    row.appendChild(meta);

    if (canOpenEntry(item)) {
      const actions = document.createElement("div");
      actions.className = "diff-item-actions";
      const open = document.createElement("a");
      open.className = "btn btn-outline-dark btn-sm";
      open.href = I18n.withLang(`/view?label=${encodeURIComponent(item.label)}`);
      open.target = "_blank";
      open.rel = "noopener noreferrer";
      open.textContent = I18n.t("search.open");
      actions.appendChild(open);
      row.appendChild(actions);
    }

    frag.appendChild(row);
  });
  list.appendChild(frag);

  if (diffMeta.truncated) {
    setDiffHint("master.diffTruncated", {
      total: App.formatNumber(diffMeta.total),
      limit: App.formatNumber(diffMeta.limit),
    });
    return;
  }
  setDiffHint("master.diffLoaded", {
    count: App.formatNumber(filtered.length),
    total: App.formatNumber(diffMeta.total),
  });
}

async function loadVersions(autoCompare) {
  setDiffHint("master.diffLoadingVersions");
  try {
    const data = await App.apiGet("/api/masterdata/versions");
    currentVersion = data.current || "";

    const seen = new Set();
    versionOptions = (data.versions || []).filter((item) => {
      if (!item?.version || seen.has(item.version)) {
        return false;
      }
      seen.add(item.version);
      return true;
    });

    renderVersionSelectOptions();
    if (versionOptions.length < 2) {
      setDiffHint("master.diffNeedMoreVersions");
      diffItems = [];
      diffSummary = { total: 0, added: 0, removed: 0, modified: 0 };
      diffMeta = { total: 0, limit: 0, truncated: false };
      renderDiffSummary(diffSummary);
      renderDiffList();
      return;
    }
    setDiffHint("master.diffReady");
    if (autoCompare) {
      await runDiff();
    }
  } catch (err) {
    versionOptions = [];
    renderVersionSelectOptions();
    setDiffHint("master.diffFailedVersions");
  }
}

async function runDiff() {
  const fromVersion = document.getElementById("diffFromVersion")?.value || "";
  const toVersion = document.getElementById("diffToVersion")?.value || "";
  if (!fromVersion || !toVersion) {
    setDiffHint("master.diffSelectVersions");
    return;
  }
  if (fromVersion === toVersion) {
    setDiffHint("master.diffNeedDifferentVersions");
    return;
  }

  setDiffHint("master.diffLoading");
  const diffList = document.getElementById("diffList");
  if (diffList) {
    diffList.textContent = I18n.t("master.diffLoading");
  }

  try {
    const data = await App.apiGet(
      `/api/masterdata/diff?from=${encodeURIComponent(fromVersion)}&to=${encodeURIComponent(toVersion)}&limit=5000`
    );
    diffItems = Array.isArray(data.items) ? data.items : [];
    diffSummary = data.summary || { total: 0, added: 0, removed: 0, modified: 0 };
    diffMeta = {
      total: data.total || diffItems.length,
      limit: data.limit || 0,
      truncated: Boolean(data.truncated),
    };
    renderDiffSummary(diffSummary);
    renderDiffList();
  } catch (err) {
    diffItems = [];
    diffSummary = { total: 0, added: 0, removed: 0, modified: 0 };
    diffMeta = { total: 0, limit: 0, truncated: false };
    renderDiffSummary(diffSummary);
    renderDiffList();
    setDiffHint("master.diffFailed");
  }
}

function bindDiffEvents() {
  const run = document.getElementById("diffRun");
  const reload = document.getElementById("diffReloadVersions");
  const status = document.getElementById("diffStatusFilter");
  const filter = document.getElementById("diffFilter");
  const from = document.getElementById("diffFromVersion");
  const to = document.getElementById("diffToVersion");

  run?.addEventListener("click", () => {
    runDiff();
  });
  reload?.addEventListener("click", () => {
    loadVersions(false);
  });
  status?.addEventListener("change", renderDiffList);
  filter?.addEventListener("input", renderDiffList);
  from?.addEventListener("change", () => {
    runDiff();
  });
  to?.addEventListener("change", () => {
    runDiff();
  });
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("masterFilter")?.addEventListener("input", renderList);
  loadMasterList();
  bindDiffEvents();
  loadVersions(true);
});
