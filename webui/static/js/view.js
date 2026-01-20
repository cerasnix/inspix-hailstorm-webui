function setLinkState(link, enabled, href) {
  if (!link) {
    return;
  }
  if (enabled) {
    link.classList.remove("disabled");
    link.setAttribute("href", href);
  } else {
    link.classList.add("disabled");
    link.setAttribute("href", "#");
  }
}

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
        `/api/entry/preview/export?label=${encodeURIComponent(label)}`,
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
}

document.addEventListener("DOMContentLoaded", () => {
  loadEntry().catch(() => {
    document.getElementById("entrySubtitle").textContent =
      I18n.t("view.failedLoad");
  });
});
