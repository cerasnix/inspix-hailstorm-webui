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
  if (preview.source && preview.source !== "plain") {
    const note = document.createElement("div");
    note.className = "preview-note";
    note.textContent = I18n.t("view.derivedPreview");
    container.appendChild(note);
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
      hint.textContent = I18n.t("view.exportNotConfigured", {
        path: preview.outputDir,
      });
    } else {
      hint.textContent = "";
    }
    return;
  }

  button.classList.remove("d-none");
  button.disabled = false;
  button.textContent = I18n.t("view.exportPreview");
  hint.textContent = preview.outputDir
    ? I18n.t("view.outputDir", { path: preview.outputDir })
    : "";

  button.onclick = async () => {
    button.disabled = true;
    button.textContent = "Exporting...";
    try {
      const res = await fetch(
        `/api/entry/preview/export?label=${encodeURIComponent(label)}`,
        { method: "POST" }
      );
      if (!res.ok) {
        throw new Error("export failed");
      }
    } catch (err) {
      hint.textContent = I18n.t("view.exportFailed");
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
