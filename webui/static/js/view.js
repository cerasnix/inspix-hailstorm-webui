function setLinkState(link, enabled, href) {
  if (!link) {
    return;
  }
  if (enabled) {
    link.classList.remove("disabled");
    link.setAttribute("href", href);
    link.setAttribute("target", "_blank");
    link.setAttribute("rel", "noopener noreferrer");
  } else {
    link.classList.add("disabled");
    link.setAttribute("href", "#");
    link.removeAttribute("target");
    link.removeAttribute("rel");
  }
}

let currentEntryLabel = "";
let viewDiffReady = false;
let viewDiffToken = 0;

function renderPills(container, items) {
  if (!container) {
    return;
  }
  if (!items || !items.length) {
    container.textContent = "None.";
    return;
  }
  container.innerHTML = "";
  items.forEach((item) => {
    const pill = document.createElement("span");
    pill.className = "pill";
    pill.textContent = item;
    container.appendChild(pill);
  });
}

function fileUrlFromPath(path) {
  if (!path) {
    return "#";
  }
  if (/^file:\/\//i.test(path)) {
    return path;
  }
  let normalized = path.replace(/\\/g, "/");
  const uncMatch = normalized.match(/^\/\/([^/]+)\/(.+)$/);
  if (uncMatch) {
    return `file://${uncMatch[1]}/${encodeURI(uncMatch[2])}`;
  }
  const winMatch = normalized.match(/^([a-zA-Z]):(\/.*)?$/);
  if (winMatch) {
    const drive = winMatch[1].toUpperCase();
    const rest = winMatch[2] || "/";
    return `file:///${drive}:${encodeURI(rest)}`;
  }
  if (!normalized.startsWith("/")) {
    normalized = `/${normalized}`;
  }
  return `file://${encodeURI(normalized)}`;
}

function renderOutputHint(hint, message, outputDir) {
  hint.textContent = "";
  if (message) {
    const line = document.createElement("div");
    line.textContent = message;
    hint.appendChild(line);
  }
  if (outputDir) {
    const row = document.createElement("div");
    const label = document.createElement("span");
    label.textContent = I18n.t("view.outputDir");
    const link = document.createElement("a");
    link.href = fileUrlFromPath(outputDir);
    link.textContent = outputDir;
    link.target = "_blank";
    link.rel = "noopener";
    row.appendChild(label);
    row.appendChild(document.createTextNode(" "));
    row.appendChild(link);
    hint.appendChild(row);
  }
}

function renderPreview(preview, label) {
  const container = document.getElementById("previewContainer");
  if (!container) {
    return;
  }
  container.innerHTML = "";
  if (!preview || !preview.available) {
    if (preview && preview.exportable) {
      container.textContent = I18n.t("view.previewNotGenerated");
    } else {
      container.textContent = I18n.t("view.previewNotAvailable");
    }
    return;
  }
  const url = `/api/entry/preview?label=${encodeURIComponent(label)}`;
  if (preview.kind === "image") {
    const img = document.createElement("img");
    img.src = url;
    img.alt = label;
    container.appendChild(img);
    return;
  }
  if (preview.kind === "audio") {
    if (preview.items && preview.items.length > 0) {
      preview.items.forEach((item, index) => {
        const wrapper = document.createElement("div");
        wrapper.className = "preview-audio-item";
        const label = document.createElement("div");
        label.className = "preview-audio-label";
        label.textContent = I18n.t("view.trackLabel", { index: index + 1 });
        const audio = document.createElement("audio");
        audio.controls = true;
        const source = document.createElement("source");
        source.src = `${url}&item=${encodeURIComponent(item.id)}`;
        if (item.type) {
          source.type = item.type;
        }
        audio.appendChild(source);
        wrapper.appendChild(label);
        wrapper.appendChild(audio);
        container.appendChild(wrapper);
      });
      return;
    }
    const audio = document.createElement("audio");
    audio.controls = true;
    const source = document.createElement("source");
    source.src = url;
    if (preview.type) {
      source.type = preview.type;
    }
    audio.appendChild(source);
    container.appendChild(audio);
    return;
  }
  if (preview.kind === "video") {
    const video = document.createElement("video");
    video.controls = true;
    video.playsInline = true;
    const source = document.createElement("source");
    source.src = url;
    if (preview.type) {
      source.type = preview.type;
    }
    video.appendChild(source);
    container.appendChild(video);
    return;
  }
  if (preview.kind === "model") {
    const viewer = document.createElement("model-viewer");
    viewer.setAttribute("src", url);
    viewer.setAttribute("camera-controls", "");
    viewer.setAttribute("auto-rotate", "");
    viewer.setAttribute("ar", "");
    viewer.setAttribute("shadow-intensity", "0.7");
    container.appendChild(viewer);
    return;
  }
  if (preview.kind === "text") {
    const pre = document.createElement("pre");
    pre.className = "preview-text";
    pre.textContent = "Loading...";
    fetch(url)
      .then((res) => res.text())
      .then((text) => {
        const max = 20000;
        if (text.length > max) {
          pre.textContent = `${text.slice(0, max)}\n... (truncated)`;
        } else {
          pre.textContent = text;
        }
      })
      .catch(() => {
        pre.textContent = I18n.t("view.failedLoad");
      });
    container.appendChild(pre);
    return;
  }
  container.textContent = I18n.t("view.previewNotSupported");
}

function renderPreviewActions(preview, label) {
  const button = document.getElementById("previewExportBtn");
  const hint = document.getElementById("previewExportHint");
  if (!button || !hint) {
    return;
  }

  if (!preview || !preview.exportable) {
    button.classList.add("d-none");
    if (preview && preview.outputDir) {
      renderOutputHint(hint, I18n.t("view.exportNotConfigured"), preview.outputDir);
    } else {
      hint.textContent = "";
    }
    return;
  }

  button.classList.remove("d-none");
  button.disabled = false;
  button.textContent = I18n.t("view.exportPreview");
  renderOutputHint(hint, "", preview.outputDir);

  button.onclick = async () => {
    button.disabled = true;
    button.textContent = "Exporting...";
    try {
      const res = await fetch(
        `/api/entry/preview/export?label=${encodeURIComponent(
          label
        )}&force=1`,
        { method: "POST" }
      );
      if (!res.ok) {
        const message = (await res.text()).trim();
        throw new Error(message || I18n.t("view.exportFailed"));
      }
    } catch (err) {
      hint.textContent = err.message || I18n.t("view.exportFailed");
    }
    await loadEntry();
  };
}

function viewDiffEnabled() {
  const from = document.getElementById("viewDiffFrom")?.value || "";
  const to = document.getElementById("viewDiffTo")?.value || "";
  return Boolean(from && to && from !== to);
}

function setViewDiffHint(message) {
  const hint = document.getElementById("viewDiffHint");
  if (!hint) {
    return;
  }
  hint.textContent = message;
}

function setViewDiffStatus(status) {
  const badge = document.getElementById("viewDiffStatus");
  if (!badge) {
    return;
  }
  const normalized = status || "unknown";
  badge.className = `badge search-diff-chip search-diff-${normalized}`;
  if (normalized === "unchanged") {
    badge.textContent = I18n.t("view.diffUnchanged");
    return;
  }
  if (normalized === "missing") {
    badge.textContent = I18n.t("view.diffMissing");
    return;
  }
  if (normalized === "loading") {
    badge.textContent = I18n.t("view.diffLoading");
    return;
  }
  if (normalized === "disabled") {
    badge.textContent = I18n.t("view.diffNeedVersions");
    return;
  }
  if (normalized === "error") {
    badge.textContent = I18n.t("view.diffFailed");
    return;
  }
  badge.textContent = I18n.t(`master.diffStatus.${normalized}`);
}

function formatViewDiffDetail(item) {
  if (!item) {
    return I18n.t("view.diffMissing");
  }
  if (item.status === "unchanged") {
    return I18n.t("view.diffUnchanged");
  }
  if (item.status === "missing") {
    return I18n.t("view.diffMissing");
  }

  const from = item.from || null;
  const to = item.to || null;
  if (item.status === "added" && to) {
    return `type: ${to.type}\nsize: ${App.formatBytes(to.size)}\nchecksum: ${to.checksum}\nresourceType: ${to.resourceType}\nrealName: ${to.realName || "-"}`;
  }
  if (item.status === "removed" && from) {
    return `type: ${from.type}\nsize: ${App.formatBytes(from.size)}\nchecksum: ${from.checksum}\nresourceType: ${from.resourceType}\nrealName: ${from.realName || "-"}`;
  }
  if (!from || !to) {
    return I18n.t("view.diffMissing");
  }

  const lines = [];
  if (from.type !== to.type) {
    lines.push(`type: ${from.type} -> ${to.type}`);
  }
  if (from.size !== to.size) {
    lines.push(`size: ${App.formatBytes(from.size)} -> ${App.formatBytes(to.size)}`);
  }
  if (from.checksum !== to.checksum) {
    lines.push(`checksum: ${from.checksum} -> ${to.checksum}`);
  }
  if (from.resourceType !== to.resourceType) {
    lines.push(`resourceType: ${from.resourceType} -> ${to.resourceType}`);
  }
  if ((from.realName || "") !== (to.realName || "")) {
    lines.push(`realName: ${from.realName || "-"} -> ${to.realName || "-"}`);
  }

  if (!lines.length) {
    return I18n.t("view.diffUnchanged");
  }
  return lines.join("\n");
}

async function runViewDiff() {
  const detail = document.getElementById("viewDiffDetail");
  if (!detail) {
    return;
  }
  if (!currentEntryLabel) {
    detail.textContent = I18n.t("view.diffWaitingEntry");
    return;
  }

  const from = document.getElementById("viewDiffFrom")?.value || "";
  const to = document.getElementById("viewDiffTo")?.value || "";
  if (!from || !to) {
    setViewDiffHint(I18n.t("view.diffNeedVersions"));
    setViewDiffStatus("disabled");
    detail.textContent = I18n.t("view.diffNeedVersions");
    return;
  }
  if (from === to) {
    setViewDiffHint(I18n.t("view.diffNeedDifferent"));
    setViewDiffStatus("disabled");
    detail.textContent = I18n.t("view.diffNeedDifferent");
    return;
  }

  setViewDiffHint(I18n.t("view.diffLoading"));
  setViewDiffStatus("loading");
  detail.textContent = I18n.t("view.diffLoading");
  const token = ++viewDiffToken;

  try {
    const data = await App.apiPost("/api/masterdata/diff/lookup", {
      from,
      to,
      labels: [currentEntryLabel],
    });
    if (token !== viewDiffToken) {
      return;
    }
    const item = (data.items || {})[currentEntryLabel] || {
      status: "missing",
    };
    setViewDiffStatus(item.status);
    setViewDiffHint(`${from} -> ${to}`);
    detail.textContent = formatViewDiffDetail(item);
  } catch (err) {
    if (token !== viewDiffToken) {
      return;
    }
    setViewDiffStatus("error");
    setViewDiffHint(I18n.t("view.diffFailed"));
    detail.textContent = I18n.t("view.diffFailed");
  }
}

function fillViewDiffSelect(select, versions, placeholder) {
  select.innerHTML = "";
  const empty = document.createElement("option");
  empty.value = "";
  empty.textContent = placeholder;
  select.appendChild(empty);
  versions.forEach((item) => {
    const option = document.createElement("option");
    option.value = item.version;
    option.textContent = item.current
      ? `${item.version} (${I18n.t("master.currentTag")})`
      : item.version;
    select.appendChild(option);
  });
}

async function initViewDiff() {
  const fromSelect = document.getElementById("viewDiffFrom");
  const toSelect = document.getElementById("viewDiffTo");
  const button = document.getElementById("viewDiffApply");
  const detail = document.getElementById("viewDiffDetail");
  if (!fromSelect || !toSelect || !button || !detail) {
    return;
  }

  try {
    const data = await App.apiGet("/api/masterdata/versions");
    const versions = Array.isArray(data.versions) ? data.versions : [];
    if (versions.length < 2) {
      fillViewDiffSelect(fromSelect, versions, I18n.t("view.diffUnavailable"));
      fillViewDiffSelect(toSelect, versions, I18n.t("view.diffUnavailable"));
      fromSelect.disabled = true;
      toSelect.disabled = true;
      button.disabled = true;
      setViewDiffHint(I18n.t("view.diffUnavailable"));
      setViewDiffStatus("disabled");
      detail.textContent = I18n.t("view.diffUnavailable");
      viewDiffReady = true;
      return;
    }

    const sorted = [...versions].sort((a, b) => b.version.localeCompare(a.version));
    fillViewDiffSelect(fromSelect, sorted, I18n.t("view.diffNeedVersions"));
    fillViewDiffSelect(toSelect, sorted, I18n.t("view.diffNeedVersions"));
    fromSelect.disabled = false;
    toSelect.disabled = false;
    button.disabled = false;

    const params = new URLSearchParams(window.location.search);
    const fromQuery = params.get("diffFrom") || "";
    const toQuery = params.get("diffTo") || "";

    const defaultTo =
      (toQuery && sorted.some((v) => v.version === toQuery) && toQuery) ||
      data.current ||
      sorted[0].version;
    let defaultFrom =
      (fromQuery && sorted.some((v) => v.version === fromQuery) && fromQuery) || "";
    if (!defaultFrom || defaultFrom === defaultTo) {
      const candidate = sorted.find((v) => v.version !== defaultTo);
      defaultFrom = candidate ? candidate.version : "";
    }
    fromSelect.value = defaultFrom;
    toSelect.value = defaultTo;

    fromSelect.onchange = () => {
      runViewDiff();
    };
    toSelect.onchange = () => {
      runViewDiff();
    };
    button.onclick = () => {
      runViewDiff();
    };

    setViewDiffHint(I18n.t("view.diffReady"));
    setViewDiffStatus("disabled");
    detail.textContent = I18n.t("view.diffReady");
    viewDiffReady = true;

    if (currentEntryLabel) {
      runViewDiff();
    }
  } catch (err) {
    fromSelect.innerHTML = `<option value="">${I18n.t("view.diffUnavailable")}</option>`;
    toSelect.innerHTML = `<option value="">${I18n.t("view.diffUnavailable")}</option>`;
    fromSelect.disabled = true;
    toSelect.disabled = true;
    button.disabled = true;
    setViewDiffHint(I18n.t("view.diffUnavailable"));
    setViewDiffStatus("error");
    detail.textContent = I18n.t("view.diffUnavailable");
    viewDiffReady = true;
  }
}

async function loadEntry() {
  const label =
    typeof entryLabel === "string" && entryLabel
      ? entryLabel
      : new URLSearchParams(window.location.search).get("label");
  if (!label) {
    document.getElementById("entryTitle").textContent = "Missing label";
    return;
  }
  const data = await App.apiGet(`/api/entry?label=${encodeURIComponent(label)}`);
  currentEntryLabel = data.label || label;

  document.getElementById("entryTitle").textContent = data.label;
  document.getElementById("entrySubtitle").textContent = data.realName;
  document.getElementById("metaLabel").textContent = data.label;
  document.getElementById("metaType").textContent = data.type;
  document.getElementById("metaResource").textContent = data.resourceType;
  document.getElementById("metaSize").textContent = App.formatBytes(data.size);
  document.getElementById("metaChecksum").textContent = data.checksum;
  document.getElementById("metaSeed").textContent = data.seed;
  document.getElementById("metaPriority").textContent = data.priority;

  document.getElementById("rawStatus").textContent = data.rawAvailable
    ? I18n.t("view.available")
    : I18n.t("view.missing");
  document.getElementById("plainStatus").textContent = data.plainAvailable
    ? I18n.t("view.available")
    : I18n.t("view.missing");
  document.getElementById("yamlStatus").textContent = data.yamlAvailable
    ? I18n.t("view.available")
    : I18n.t("view.missing");

  setLinkState(
    document.getElementById("downloadRaw"),
    data.rawAvailable,
    `/api/entry/raw?label=${encodeURIComponent(label)}`
  );
  setLinkState(
    document.getElementById("downloadPlain"),
    data.plainAvailable,
    `/api/entry/plain?label=${encodeURIComponent(label)}`
  );
  setLinkState(
    document.getElementById("downloadYaml"),
    data.yamlAvailable,
    `/api/entry/yaml?label=${encodeURIComponent(label)}`
  );

  renderPills(document.getElementById("depList"), data.dependencies);
  renderPills(document.getElementById("contentList"), data.contentTypes);
  renderPills(document.getElementById("categoryList"), data.categories);
  renderPreview(data.preview, label);
  renderPreviewActions(data.preview, label);
  if (viewDiffReady) {
    runViewDiff();
  }
}

document.addEventListener("DOMContentLoaded", () => {
  initViewDiff();
  loadEntry().catch(() => {
    document.getElementById("entrySubtitle").textContent =
      I18n.t("view.failedLoad");
  });
});
