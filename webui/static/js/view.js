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
let previewRenderDisposers = [];
let previewExportRunToken = 0;
let previewAudioContext = null;
let threeModulesPromise = null;

function addPreviewDisposer(disposer) {
  if (typeof disposer === "function") {
    previewRenderDisposers.push(disposer);
  }
}

function disposePreviewResources() {
  if (!previewRenderDisposers.length) {
    return;
  }
  previewRenderDisposers.forEach((dispose) => {
    try {
      dispose();
    } catch (err) {
      // Ignore cleanup failures from detached media nodes.
    }
  });
  previewRenderDisposers = [];
}

function clampPercent(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return 0;
  }
  if (num < 0) {
    return 0;
  }
  if (num > 100) {
    return 100;
  }
  return num;
}

function exportPhaseText(phase, message) {
  const normalized = String(phase || "").trim().toLowerCase();
  if (message) {
    if (normalized === "probe" && message.startsWith("streams=")) {
      const count = message.slice("streams=".length);
      return I18n.t("view.exportPhaseProbeStreams", { count });
    }
    if (normalized === "transcode" && message.startsWith("track=")) {
      return I18n.t("view.exportPhaseTrack", {
        track: message.slice("track=".length),
      });
    }
  }
  switch (normalized) {
    case "queued":
      return I18n.t("view.exportPhaseQueued");
    case "prepare":
      return I18n.t("view.exportPhasePrepare");
    case "probe":
      return I18n.t("view.exportPhaseProbe");
    case "audio":
      return I18n.t("view.exportPhaseAudio");
    case "decode":
      return I18n.t("view.exportPhaseDecode");
    case "encode":
      return I18n.t("view.exportPhaseEncode");
    case "remux":
      return I18n.t("view.exportPhaseRemux");
    case "transcode":
      return I18n.t("view.exportPhaseTranscode");
    case "finalize":
      return I18n.t("view.exportPhaseFinalize");
    case "cached":
      return I18n.t("view.exportPhaseCached");
    case "done":
      return I18n.t("view.exportPhaseDone");
    default:
      return I18n.t("view.exportPhaseWorking");
  }
}

function setPreviewExportProgress({ visible, percent, text, state }) {
  const shell = document.getElementById("previewExportProgress");
  const label = document.getElementById("previewExportProgressLabel");
  const value = document.getElementById("previewExportProgressValue");
  const bar = document.getElementById("previewExportProgressBar");
  if (!shell || !label || !value || !bar) {
    return;
  }

  if (!visible) {
    shell.classList.add("d-none");
    shell.classList.remove("is-error", "is-success");
    bar.style.width = "0%";
    bar.setAttribute("aria-valuenow", "0");
    label.textContent = I18n.t("view.exportPhaseIdle");
    value.textContent = "0%";
    return;
  }

  const safe = clampPercent(percent);
  shell.classList.remove("d-none");
  shell.classList.toggle("is-error", state === "error");
  shell.classList.toggle("is-success", state === "success");
  bar.style.width = `${safe}%`;
  bar.setAttribute("aria-valuenow", String(Math.round(safe)));
  label.textContent = text || I18n.t("view.exportPhaseWorking");
  value.textContent = `${Math.round(safe)}%`;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pollPreviewExportTask(taskId, token) {
  const started = Date.now();
  while (previewExportRunToken === token) {
    const payload = await App.apiGet(
      `/api/entry/preview/export/status?id=${encodeURIComponent(taskId)}`
    );
    const task = payload.task || payload || {};
    const status = String(task.status || "running").toLowerCase();
    const phase = task.phase || "";
    const message = task.message || "";
    const percent = clampPercent(task.percent);

    setPreviewExportProgress({
      visible: true,
      percent,
      text: exportPhaseText(phase, message),
      state: status,
    });

    if (status === "success") {
      return task;
    }
    if (status === "error") {
      const errorText = String(task.error || "").trim();
      throw new Error(errorText || I18n.t("view.exportFailed"));
    }

    if (Date.now() - started > 20 * 60 * 1000) {
      throw new Error(I18n.t("view.exportTimeout"));
    }
    await wait(650);
  }
  throw new Error(I18n.t("view.exportCanceled"));
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

function renderParentList(parents) {
  const container = document.getElementById("parentList");
  if (!container) {
    return;
  }
  const list = Array.isArray(parents) ? parents : [];
  if (!list.length) {
    container.textContent = I18n.t("view.noParents");
    return;
  }

  container.innerHTML = "";
  list.forEach((item) => {
    const row = document.createElement("a");
    row.className = "parent-item";
    row.href = `/view?label=${encodeURIComponent(item.label || "")}`;
    row.target = "_blank";
    row.rel = "noopener noreferrer";

    const label = document.createElement("span");
    label.className = "parent-item-label";
    label.textContent = item.label || "-";

    const meta = document.createElement("span");
    meta.className = "parent-item-meta";
    meta.textContent = `${item.type || "-"} · ${App.formatBytes(item.size || 0)}`;

    row.appendChild(label);
    row.appendChild(meta);
    container.appendChild(row);
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

function previewItemUrl(label, itemId) {
  const encoded = encodeURIComponent(label);
  if (!itemId) {
    return `/api/entry/preview?label=${encoded}`;
  }
  return `/api/entry/preview?label=${encoded}&item=${encodeURIComponent(itemId)}`;
}

function inferPreviewKindFromType(type) {
  const value = String(type || "").toLowerCase();
  if (value.startsWith("image/")) {
    return "image";
  }
  if (value.startsWith("audio/")) {
    return "audio";
  }
  if (value.startsWith("video/")) {
    return "video";
  }
  if (value.startsWith("model/")) {
    return "model";
  }
  if (value.includes("json") || value.startsWith("text/")) {
    return "text";
  }
  return "";
}

function createMediaNode(kind, url, type, label) {
  if (kind === "image") {
    const img = document.createElement("img");
    img.src = url;
    img.alt = label;
    return img;
  }
  if (kind === "audio") {
    const audio = document.createElement("audio");
    audio.controls = true;
    const source = document.createElement("source");
    source.src = url;
    if (type) {
      source.type = type;
    }
    audio.appendChild(source);
    return audio;
  }
  if (kind === "video") {
    const video = document.createElement("video");
    video.controls = true;
    video.playsInline = true;
    const source = document.createElement("source");
    source.src = url;
    if (type) {
      source.type = type;
    }
    video.appendChild(source);
    return video;
  }
  if (kind === "model") {
    const defaultOrbit = "35deg 72deg auto";
    const shell = document.createElement("div");
    shell.className = "model-viewer-shell";

    const viewer = document.createElement("model-viewer");
    viewer.setAttribute("src", url);
    viewer.setAttribute("camera-controls", "");
    viewer.setAttribute("auto-rotate", "");
    viewer.setAttribute("ar", "");
    viewer.setAttribute("rotation-per-second", "18deg");
    viewer.setAttribute("interaction-prompt", "none");
    viewer.setAttribute("camera-orbit", defaultOrbit);
    viewer.setAttribute("min-camera-orbit", "auto 10deg auto");
    viewer.setAttribute("max-camera-orbit", "auto 175deg auto");
    viewer.setAttribute("field-of-view", "32deg");
    viewer.setAttribute("min-field-of-view", "12deg");
    viewer.setAttribute("max-field-of-view", "60deg");
    viewer.setAttribute("shadow-intensity", "1");
    viewer.setAttribute("shadow-softness", "0.85");
    viewer.setAttribute("exposure", "1.12");
    viewer.setAttribute("environment-image", "legacy");

    const toolbar = document.createElement("div");
    toolbar.className = "model-viewer-toolbar";

    const resetButton = document.createElement("button");
    resetButton.type = "button";
    resetButton.className = "model-viewer-btn";
    resetButton.textContent = I18n.t("view.modelReset");
    resetButton.onclick = () => {
      viewer.setAttribute("camera-orbit", defaultOrbit);
      if (typeof viewer.jumpCameraToGoal === "function") {
        viewer.jumpCameraToGoal();
      }
    };

    const contrastButton = document.createElement("button");
    contrastButton.type = "button";
    contrastButton.className = "model-viewer-btn";
    contrastButton.textContent = I18n.t("view.modelContrastOff");
    contrastButton.onclick = () => {
      const enabled = shell.classList.toggle("high-contrast");
      contrastButton.textContent = enabled
        ? I18n.t("view.modelContrastOn")
        : I18n.t("view.modelContrastOff");
    };

    toolbar.appendChild(resetButton);
    toolbar.appendChild(contrastButton);
    shell.appendChild(viewer);
    shell.appendChild(toolbar);
    return shell;
  }
  return null;
}

function getPreviewAudioContext() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) {
    return null;
  }
  if (!previewAudioContext || previewAudioContext.state === "closed") {
    previewAudioContext = new Ctx();
  }
  return previewAudioContext;
}

function ensureCanvasSize(canvas) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.floor(canvas.clientWidth * dpr));
  const height = Math.max(1, Math.floor(canvas.clientHeight * dpr));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return null;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return {
    ctx,
    width: canvas.clientWidth,
    height: canvas.clientHeight,
  };
}

function drawAudioVisualizerFrame(canvas, levels, seed) {
  const state = ensureCanvasSize(canvas);
  if (!state) {
    return;
  }
  const { ctx, width, height } = state;
  ctx.clearRect(0, 0, width, height);

  const gradient = ctx.createLinearGradient(0, 0, width, 0);
  gradient.addColorStop(0, "rgba(33, 93, 111, 0.95)");
  gradient.addColorStop(0.7, "rgba(22, 129, 154, 0.9)");
  gradient.addColorStop(1, "rgba(227, 106, 45, 0.9)");
  ctx.fillStyle = gradient;

  const bars = 42;
  const gap = 2;
  const barWidth = Math.max(2, (width - gap * (bars - 1)) / bars);
  for (let i = 0; i < bars; i += 1) {
    const idx = Math.min(
      levels.length - 1,
      Math.floor((i / (bars - 1 || 1)) * (levels.length - 1))
    );
    const value = Number(levels[idx] || 0);
    const norm = Math.max(0.06, Math.min(1, value));
    const wobble = 0.08 * Math.sin(seed * 0.11 + i * 0.47);
    const barHeight = Math.max(2, Math.min(height, height * (norm + wobble)));
    const x = i * (barWidth + gap);
    const y = height - barHeight;
    ctx.fillRect(x, y, barWidth, barHeight);
  }
}

function drawAudioVisualizerIdle(canvas, seed = 0) {
  const levels = new Array(42).fill(0).map((_, idx) => {
    return 0.18 + ((Math.sin(seed + idx * 0.35) + 1) * 0.16);
  });
  drawAudioVisualizerFrame(canvas, levels, seed);
}

function attachAudioVisualizer(audio, canvas, seed = 0) {
  if (!audio || !canvas) {
    return () => {};
  }

  const FrequencyBins = 128;
  let analyser = null;
  let sourceNode = null;
  let data = null;
  let rafId = 0;
  let destroyed = false;
  let frameTick = 0;

  const stopLoop = () => {
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
    drawAudioVisualizerIdle(canvas, seed + frameTick);
  };

  const ensureAnalyser = () => {
    if (analyser) {
      return true;
    }
    const audioContext = getPreviewAudioContext();
    if (!audioContext) {
      return false;
    }
    try {
      analyser = audioContext.createAnalyser();
      analyser.fftSize = FrequencyBins * 2;
      analyser.smoothingTimeConstant = 0.78;
      data = new Uint8Array(analyser.frequencyBinCount);
      sourceNode = audioContext.createMediaElementSource(audio);
      sourceNode.connect(analyser);
      analyser.connect(audioContext.destination);
      return true;
    } catch (err) {
      return false;
    }
  };

  const render = () => {
    if (destroyed) {
      return;
    }
    frameTick += 1;
    if (analyser && data) {
      analyser.getByteFrequencyData(data);
      const normalized = Array.from(data, (value) => value / 255);
      drawAudioVisualizerFrame(canvas, normalized, seed + frameTick);
    } else {
      drawAudioVisualizerIdle(canvas, seed + frameTick * 0.02);
    }
    rafId = requestAnimationFrame(render);
  };

  const handlePlay = async () => {
    if (!ensureAnalyser()) {
      return;
    }
    const audioContext = getPreviewAudioContext();
    if (audioContext) {
      try {
        await audioContext.resume();
      } catch (err) {
        // Ignore resume failures caused by browser autoplay policies.
      }
    }
    if (!rafId) {
      render();
    }
  };

  const handlePause = () => {
    stopLoop();
  };

  const handleResize = () => {
    drawAudioVisualizerIdle(canvas, seed + frameTick);
  };

  audio.addEventListener("play", handlePlay);
  audio.addEventListener("pause", handlePause);
  audio.addEventListener("ended", handlePause);
  window.addEventListener("resize", handleResize);
  drawAudioVisualizerIdle(canvas, seed);

  return () => {
    destroyed = true;
    stopLoop();
    audio.removeEventListener("play", handlePlay);
    audio.removeEventListener("pause", handlePause);
    audio.removeEventListener("ended", handlePause);
    window.removeEventListener("resize", handleResize);
    if (sourceNode) {
      try {
        sourceNode.disconnect();
      } catch (err) {
        // Ignore disconnect races when DOM is torn down.
      }
    }
    if (analyser) {
      try {
        analyser.disconnect();
      } catch (err) {
        // Ignore disconnect races when DOM is torn down.
      }
    }
  };
}

function createAudioPreviewCard({ url, type, label, title, trackTag, seed }) {
  const card = document.createElement("article");
  card.className = "preview-audio-item";

  const head = document.createElement("div");
  head.className = "preview-audio-head";

  const nameWrap = document.createElement("div");
  nameWrap.className = "preview-audio-copy";
  const titleEl = document.createElement("div");
  titleEl.className = "preview-audio-label";
  titleEl.textContent = title;
  const metaEl = document.createElement("div");
  metaEl.className = "preview-audio-meta";
  metaEl.textContent = type
    ? I18n.t("view.audioFormat", { type })
    : I18n.t("view.audioFormatUnknown");
  nameWrap.appendChild(titleEl);
  nameWrap.appendChild(metaEl);
  head.appendChild(nameWrap);

  if (trackTag) {
    const tag = document.createElement("span");
    tag.className = "preview-audio-track";
    tag.textContent = trackTag;
    head.appendChild(tag);
  }

  const canvas = document.createElement("canvas");
  canvas.className = "preview-audio-visualizer";
  card.appendChild(head);
  card.appendChild(canvas);

  const audio = createMediaNode("audio", url, type, label);
  if (audio) {
    audio.classList.add("preview-audio-player");
    card.appendChild(audio);
    addPreviewDisposer(attachAudioVisualizer(audio, canvas, seed));
  }
  return card;
}

function renderAudioPreview(container, preview, label) {
  const items = Array.isArray(preview.items) && preview.items.length
    ? preview.items
    : [
        {
          id: "",
          type: preview.type || "",
          name: I18n.t("view.trackLabel", { index: 1 }),
        },
      ];

  const grid = document.createElement("div");
  grid.className = "preview-audio-grid";
  items.forEach((item, index) => {
    const title = item.name || I18n.t("view.trackLabel", { index: index + 1 });
    const trackTag = item.id ? `#${item.id}` : "";
    const card = createAudioPreviewCard({
      url: previewItemUrl(label, item.id || ""),
      type: item.type || preview.type || "",
      label,
      title,
      trackTag,
      seed: index + 1,
    });
    grid.appendChild(card);
  });
  container.appendChild(grid);
}

async function loadThreeModules() {
  if (!threeModulesPromise) {
    threeModulesPromise = Promise.all([
      import("https://cdn.jsdelivr.net/npm/three@0.164.1/build/three.module.js"),
      import("https://cdn.jsdelivr.net/npm/three@0.164.1/examples/jsm/controls/OrbitControls.js"),
      import("https://cdn.jsdelivr.net/npm/three@0.164.1/examples/jsm/loaders/GLTFLoader.js"),
    ]).then(([threeMod, controlsMod, loaderMod]) => ({
      THREE: threeMod,
      OrbitControls: controlsMod.OrbitControls,
      GLTFLoader: loaderMod.GLTFLoader,
    }));
  }
  return threeModulesPromise;
}

function mountPrefabAssemblyViewer(viewport, statusEl, entries, rootLabel) {
  let disposed = false;
  let rafId = 0;
  let resizeOff = () => {};
  let cleanupRenderer = () => {};

  loadThreeModules()
    .then(({ THREE, OrbitControls, GLTFLoader }) => {
      if (disposed) {
        return;
      }

      const renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: "high-performance",
      });
      if ("outputColorSpace" in renderer && "SRGBColorSpace" in THREE) {
        renderer.outputColorSpace = THREE.SRGBColorSpace;
      }
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      viewport.innerHTML = "";
      viewport.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(44, 1, 0.01, 5000);
      camera.position.set(1.2, 1.1, 2.4);

      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;

      const hemi = new THREE.HemisphereLight(0xf7fbff, 0x5f6d7b, 1.08);
      scene.add(hemi);
      const keyLight = new THREE.DirectionalLight(0xffffff, 1.1);
      keyLight.position.set(3, 6, 4);
      scene.add(keyLight);
      const fillLight = new THREE.DirectionalLight(0x86a2c4, 0.45);
      fillLight.position.set(-4, 2.5, -3);
      scene.add(fillLight);

      const root = new THREE.Group();
      scene.add(root);

      const grid = new THREE.GridHelper(8, 16, 0x5f7488, 0x8da2b4);
      if (grid.material) {
        grid.material.transparent = true;
        grid.material.opacity = 0.22;
      }
      grid.position.y = -0.001;
      scene.add(grid);

      const resize = () => {
        if (disposed) {
          return;
        }
        const width = Math.max(220, viewport.clientWidth || 220);
        const height = Math.max(240, viewport.clientHeight || 240);
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
      };
      resize();

      if (typeof ResizeObserver !== "undefined") {
        const observer = new ResizeObserver(() => resize());
        observer.observe(viewport);
        resizeOff = () => observer.disconnect();
      } else {
        window.addEventListener("resize", resize);
        resizeOff = () => window.removeEventListener("resize", resize);
      }

      const fitCameraToVisible = () => {
        const box = new THREE.Box3();
        let hasMesh = false;
        root.traverse((obj) => {
          if (!obj.visible || !obj.isMesh) {
            return;
          }
          hasMesh = true;
          box.expandByObject(obj);
        });
        if (!hasMesh || box.isEmpty()) {
          return;
        }
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z, 0.01);
        const distance =
          (maxDim / (2 * Math.tan((camera.fov * Math.PI) / 360))) * 1.42;
        const offset = new THREE.Vector3(0.9, 0.66, 1).normalize().multiplyScalar(distance);
        camera.position.copy(center).add(offset);
        camera.near = Math.max(distance / 280, 0.01);
        camera.far = Math.max(distance * 30, 80);
        camera.updateProjectionMatrix();
        controls.target.copy(center);
        controls.update();
        grid.position.y = box.min.y;
      };

      const updateStatus = (loaded, failed, done = false) => {
        const total = entries.length;
        if (!done) {
          statusEl.textContent = I18n.t("view.prefabAssemblyLoading", {
            loaded: String(loaded),
            total: String(total),
          });
          return;
        }
        if (loaded === 0 || failed === total) {
          statusEl.textContent = I18n.t("view.prefabAssemblyFailed");
          return;
        }
        if (failed > 0) {
          statusEl.textContent = I18n.t("view.prefabAssemblyPartial", {
            loaded: String(loaded),
            total: String(total),
          });
          return;
        }
        statusEl.textContent = I18n.t("view.prefabAssemblyReady", {
          count: String(loaded),
        });
      };

      const refreshVisibility = () => {
        entries.forEach((entry) => {
          if (entry.object) {
            entry.object.visible = Boolean(entry.enabled);
          }
        });
        fitCameraToVisible();
      };

      entries.forEach((entry) => {
        if (!entry.checkbox) {
          return;
        }
        entry.checkbox.onchange = () => {
          entry.enabled = Boolean(entry.checkbox.checked);
          refreshVisibility();
        };
      });

      const loader = new GLTFLoader();
      const loadAll = async () => {
        let loaded = 0;
        let failed = 0;
        updateStatus(loaded, failed, false);

        for (const entry of entries) {
          if (disposed) {
            return;
          }
          const label = entry.label || rootLabel;
          const itemId = entry.itemId || "";
          try {
            const gltf = await loader.loadAsync(previewItemUrl(label, itemId));
            if (disposed) {
              return;
            }
            const object =
              gltf.scene ||
              (Array.isArray(gltf.scenes) && gltf.scenes.length > 0
                ? gltf.scenes[0]
                : null);
            if (!object) {
              throw new Error("scene missing");
            }
            object.name = entry.name || label;
            object.visible = Boolean(entry.enabled);
            root.add(object);
            entry.object = object;
            loaded += 1;
            if (entry.row) {
              entry.row.classList.add("loaded");
            }
          } catch (err) {
            failed += 1;
            if (entry.row) {
              entry.row.classList.add("failed");
            }
          }
          updateStatus(loaded, failed, false);
          fitCameraToVisible();
        }
        updateStatus(loaded, failed, true);
      };

      const render = () => {
        if (disposed) {
          return;
        }
        controls.update();
        renderer.render(scene, camera);
        rafId = requestAnimationFrame(render);
      };
      render();
      loadAll();

      cleanupRenderer = () => {
        if (rafId) {
          cancelAnimationFrame(rafId);
          rafId = 0;
        }
        resizeOff();
        controls.dispose();
        renderer.dispose();
        if (renderer.domElement && renderer.domElement.parentNode === viewport) {
          viewport.removeChild(renderer.domElement);
        }
      };
    })
    .catch(() => {
      if (!disposed) {
        statusEl.textContent = I18n.t("view.prefabAssemblyFailed");
      }
    });

  return () => {
    disposed = true;
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
    resizeOff();
    cleanupRenderer();
  };
}

function createPrefabAssemblySection(assembly, rootLabel) {
  const section = document.createElement("section");
  section.className = "prefab-section prefab-assembly";

  const title = document.createElement("h4");
  title.textContent = I18n.t("view.prefabAssemblyTitle");
  section.appendChild(title);

  const hint = document.createElement("div");
  hint.className = "prefab-assembly-hint";
  hint.textContent = I18n.t("view.prefabAssemblyHint");
  section.appendChild(hint);

  const components = Array.isArray(assembly?.components)
    ? assembly.components.filter((item) => item && (item.label || rootLabel))
    : [];
  if (!components.length) {
    const empty = document.createElement("div");
    empty.className = "prefab-empty";
    empty.textContent = I18n.t("view.prefabAssemblyNoComponents");
    section.appendChild(empty);
    return section;
  }

  const layout = document.createElement("div");
  layout.className = "prefab-assembly-layout";

  const viewportShell = document.createElement("div");
  viewportShell.className = "prefab-assembly-viewport-shell";
  const viewport = document.createElement("div");
  viewport.className = "prefab-assembly-viewport";
  const status = document.createElement("div");
  status.className = "prefab-assembly-status";
  status.textContent = I18n.t("view.prefabAssemblyLoading", {
    loaded: "0",
    total: String(components.length),
  });
  viewportShell.appendChild(viewport);
  viewportShell.appendChild(status);
  layout.appendChild(viewportShell);

  const list = document.createElement("div");
  list.className = "prefab-assembly-list";

  const entries = components.map((component, index) => {
    const row = document.createElement("label");
    row.className = "prefab-assembly-item";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = true;
    checkbox.className = "prefab-assembly-checkbox";

    const copy = document.createElement("div");
    copy.className = "prefab-assembly-copy";
    const name = document.createElement("div");
    name.className = "prefab-assembly-name";
    name.textContent =
      component.name || `${I18n.t("view.prefabItem")} ${index + 1}`;
    const meta = document.createElement("div");
    meta.className = "prefab-assembly-meta";
    const sourceText =
      component.source === "self"
        ? I18n.t("view.prefabAssemblyFromSelf")
        : I18n.t("view.prefabAssemblyFromDependency");
    meta.textContent = `${sourceText} · ${component.label || rootLabel}`;

    copy.appendChild(name);
    copy.appendChild(meta);
    row.appendChild(checkbox);
    row.appendChild(copy);
    list.appendChild(row);

    return {
      label: component.label || rootLabel,
      itemId: component.itemId || "",
      name: component.name || "",
      type: component.type || "",
      source: component.source || "",
      enabled: true,
      object: null,
      checkbox,
      row,
    };
  });
  layout.appendChild(list);
  section.appendChild(layout);

  const missing = Array.isArray(assembly?.missingDependencies)
    ? assembly.missingDependencies
    : [];
  if (missing.length) {
    const footer = document.createElement("div");
    footer.className = "prefab-assembly-missing";
    footer.textContent = I18n.t("view.prefabAssemblyMissingDeps", {
      count: String(missing.length),
    });
    section.appendChild(footer);
  }

  addPreviewDisposer(mountPrefabAssemblyViewer(viewport, status, entries, rootLabel));
  return section;
}

function translatePrefabComponent(name) {
  const clean = String(name || "").trim();
  if (!clean) {
    return "-";
  }
  const key = `view.prefabComp.${clean}`;
  const text = I18n.t(key);
  return text === key ? clean : text;
}

function buildPrefabHierarchyTreeNode(node, depth = 0) {
  if (!node) {
    return null;
  }
  const name = node.name || I18n.t("view.prefabNodeUnnamed");
  const components = Array.isArray(node.components) ? node.components : [];
  const children = Array.isArray(node.children) ? node.children : [];
  const hasChildren = children.length > 0;

  if (!hasChildren) {
    const leaf = document.createElement("div");
    leaf.className = "prefab-tree-leaf";
    const head = document.createElement("div");
    head.className = "prefab-tree-head";
    const nameEl = document.createElement("span");
    nameEl.className = "prefab-node-name";
    nameEl.textContent = name;
    head.appendChild(nameEl);

    if (components.length) {
      const tags = document.createElement("div");
      tags.className = "prefab-component-list";
      components.forEach((component) => {
        const tag = document.createElement("span");
        tag.className = "prefab-component";
        tag.textContent = translatePrefabComponent(component);
        tags.appendChild(tag);
      });
      head.appendChild(tags);
    }
    leaf.appendChild(head);
    return leaf;
  }

  const details = document.createElement("details");
  details.className = "prefab-tree-node";
  if (depth < 2) {
    details.open = true;
  }

  const summary = document.createElement("summary");
  summary.className = "prefab-tree-head";
  const nameEl = document.createElement("span");
  nameEl.className = "prefab-node-name";
  nameEl.textContent = name;
  summary.appendChild(nameEl);

  if (components.length) {
    const tags = document.createElement("div");
    tags.className = "prefab-component-list";
    components.forEach((component) => {
      const tag = document.createElement("span");
      tag.className = "prefab-component";
      tag.textContent = translatePrefabComponent(component);
      tags.appendChild(tag);
    });
    summary.appendChild(tags);
  }
  details.appendChild(summary);

  const childBox = document.createElement("div");
  childBox.className = "prefab-tree-children";
  children.forEach((child) => {
    const childNode = buildPrefabHierarchyTreeNode(child, depth + 1);
    if (childNode) {
      childBox.appendChild(childNode);
    }
  });
  details.appendChild(childBox);
  return details;
}

function createPrefabHierarchySection(hierarchy) {
  const section = document.createElement("section");
  section.className = "prefab-section";

  const title = document.createElement("h4");
  title.textContent = I18n.t("view.prefabHierarchy");
  section.appendChild(title);

  if (!hierarchy || !hierarchy.available) {
    const empty = document.createElement("div");
    empty.className = "prefab-empty";
    empty.textContent = I18n.t("view.prefabHierarchyUnavailable");
    section.appendChild(empty);
    return section;
  }

  const rendered = Number(hierarchy.renderedNodeCount || 0);
  const total = Number(hierarchy.nodeCount || rendered);
  const roots = Number(hierarchy.rootCount || 0);
  const depth = Number(hierarchy.maxDepth || 0);
  const summary = document.createElement("div");
  summary.className = "prefab-hierarchy-summary";
  summary.textContent = I18n.t("view.prefabHierarchySummary", {
    rendered: String(rendered),
    total: String(total),
    roots: String(roots),
    depth: String(depth),
  });
  section.appendChild(summary);

  const stats = Array.isArray(hierarchy.componentStats)
    ? hierarchy.componentStats
    : [];
  if (stats.length) {
    const statsBox = document.createElement("div");
    statsBox.className = "prefab-hierarchy-stats";
    stats.slice(0, 12).forEach((item) => {
      const chip = document.createElement("span");
      chip.className = "prefab-chip";
      const label = translatePrefabComponent(item.name || "");
      chip.textContent = `${label} ${item.count || 0}`;
      statsBox.appendChild(chip);
    });
    section.appendChild(statsBox);
  }

  if (hierarchy.truncated) {
    const notice = document.createElement("div");
    notice.className = "prefab-hierarchy-truncated";
    notice.textContent = I18n.t("view.prefabHierarchyTruncated");
    section.appendChild(notice);
  }

  const tree = document.createElement("div");
  tree.className = "prefab-tree";
  const rootsData = Array.isArray(hierarchy.roots) ? hierarchy.roots : [];
  rootsData.forEach((rootNode) => {
    const nodeEl = buildPrefabHierarchyTreeNode(rootNode, 0);
    if (nodeEl) {
      tree.appendChild(nodeEl);
    }
  });
  if (!rootsData.length) {
    const empty = document.createElement("div");
    empty.className = "prefab-empty";
    empty.textContent = I18n.t("view.prefabHierarchyUnavailable");
    tree.appendChild(empty);
  }
  section.appendChild(tree);
  return section;
}

function renderPrefabPreview(container, preview, label) {
  const wrapper = document.createElement("div");
  wrapper.className = "prefab-preview";

  const meta = preview.meta || {};

  const stage = document.createElement("div");
  stage.className = "prefab-stage";
  const media = document.createElement("div");
  media.className = "prefab-media";
  stage.appendChild(media);

  const items = Array.isArray(preview.items)
    ? preview.items
        .map((item, index) => {
          if (!item) {
            return null;
          }
          const itemKind = item.kind || inferPreviewKindFromType(item.type);
          if (!itemKind) {
            return null;
          }
          return {
            id: item.id || "",
            kind: itemKind,
            type: item.type || "",
            name:
              item.name ||
              `${I18n.t("view.prefabItem")} ${index + 1}`,
            url: previewItemUrl(label, item.id || ""),
          };
        })
        .filter(Boolean)
    : [];

  if (!items.length && preview.type) {
    const fallbackKind = inferPreviewKindFromType(preview.type);
    if (fallbackKind) {
      items.push({
        id: "",
        kind: fallbackKind,
        type: preview.type,
        name: I18n.t("view.prefabPrimary"),
        url: previewItemUrl(label, ""),
      });
    }
  }

  let activeIndex = 0;
  const mediaTitle = document.createElement("div");
  mediaTitle.className = "prefab-media-title";
  stage.appendChild(mediaTitle);

  const renderActiveItem = () => {
    media.innerHTML = "";
    if (!items.length) {
      media.textContent = I18n.t("view.prefabNoMedia");
      mediaTitle.textContent = "";
      return;
    }
    const active = items[activeIndex] || items[0];
    mediaTitle.textContent = active.name || I18n.t("view.prefabPrimary");
    const node = createMediaNode(active.kind, active.url, active.type, label);
    if (!node) {
      media.textContent = I18n.t("view.previewNotSupported");
      return;
    }
    media.appendChild(node);
  };
  renderActiveItem();

  if (items.length > 1) {
    const switcher = document.createElement("div");
    switcher.className = "prefab-switcher";
    items.forEach((item, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "prefab-switch-btn";
      button.textContent = item.name || `${I18n.t("view.prefabItem")} ${index + 1}`;
      if (index === activeIndex) {
        button.classList.add("active");
      }
      button.onclick = () => {
        activeIndex = index;
        switcher
          .querySelectorAll(".prefab-switch-btn")
          .forEach((el, idx) => el.classList.toggle("active", idx === index));
        renderActiveItem();
      };
      switcher.appendChild(button);
    });
    stage.appendChild(switcher);
  }

  if (meta.assembly && meta.assembly.available) {
    stage.appendChild(createPrefabAssemblySection(meta.assembly, label));
  }

  const panel = document.createElement("aside");
  panel.className = "prefab-panel";

  const panelTitle = document.createElement("h3");
  panelTitle.className = "prefab-panel-title";
  panelTitle.textContent = I18n.t("view.prefabSummary");
  panel.appendChild(panelTitle);

  const bundleName = meta.bundleName || "-";
  const dependencyCount = Number(meta.dependencyCount || 0);
  const assetTotal = Number(meta.assetTotal || 0);
  const itemCount = Number(meta.itemCount || items.length || 0);

  const rows = document.createElement("div");
  rows.className = "prefab-meta-rows";

  const appendRow = (key, value) => {
    const row = document.createElement("div");
    row.className = "prefab-meta-row";
    const keyEl = document.createElement("span");
    keyEl.className = "prefab-meta-key";
    keyEl.textContent = key;
    const valueEl = document.createElement("span");
    valueEl.className = "prefab-meta-value";
    valueEl.textContent = value;
    row.appendChild(keyEl);
    row.appendChild(valueEl);
    rows.appendChild(row);
  };

  appendRow(I18n.t("view.prefabBundle"), bundleName);
  appendRow(I18n.t("view.prefabPreviewItems"), String(itemCount));
  appendRow(I18n.t("view.prefabAssetsTotal"), String(assetTotal));
  appendRow(I18n.t("view.prefabDependencies"), String(dependencyCount));
  panel.appendChild(rows);

  const roots = Array.isArray(meta.rootObjects) ? meta.rootObjects : [];
  if (roots.length) {
    const section = document.createElement("section");
    section.className = "prefab-section";
    const title = document.createElement("h4");
    title.textContent = I18n.t("view.prefabRootObjects");
    section.appendChild(title);
    const list = document.createElement("div");
    list.className = "prefab-chip-list";
    roots.forEach((name) => {
      const chip = document.createElement("span");
      chip.className = "prefab-chip";
      chip.textContent = name;
      list.appendChild(chip);
    });
    section.appendChild(list);
    panel.appendChild(section);
  }

  const groups = Array.isArray(meta.assetGroups) ? meta.assetGroups : [];
  if (groups.length) {
    const section = document.createElement("section");
    section.className = "prefab-section";
    const title = document.createElement("h4");
    title.textContent = I18n.t("view.prefabAssetGroups");
    section.appendChild(title);
    const list = document.createElement("div");
    list.className = "prefab-group-list";
    groups.slice(0, 12).forEach((group) => {
      const row = document.createElement("div");
      row.className = "prefab-group-row";
      const name = document.createElement("span");
      name.textContent = group.name || "-";
      const count = document.createElement("span");
      count.textContent = String(group.count || 0);
      row.appendChild(name);
      row.appendChild(count);
      list.appendChild(row);
    });
    section.appendChild(list);
    panel.appendChild(section);
  }

  panel.appendChild(createPrefabHierarchySection(meta.hierarchy));

  const deps = Array.isArray(meta.dependencies) ? meta.dependencies : [];
  const depSection = document.createElement("section");
  depSection.className = "prefab-section";
  const depTitle = document.createElement("h4");
  depTitle.textContent = I18n.t("view.prefabDependencyList");
  depSection.appendChild(depTitle);
  if (!deps.length) {
    const empty = document.createElement("div");
    empty.className = "prefab-empty";
    empty.textContent = I18n.t("view.prefabNoDependencies");
    depSection.appendChild(empty);
  } else {
    const depList = document.createElement("div");
    depList.className = "prefab-chip-list";
    deps.slice(0, 40).forEach((name) => {
      const chip = document.createElement("span");
      chip.className = "prefab-chip";
      chip.textContent = name;
      depList.appendChild(chip);
    });
    depSection.appendChild(depList);
  }
  panel.appendChild(depSection);

  wrapper.appendChild(stage);
  wrapper.appendChild(panel);
  container.appendChild(wrapper);
}

function renderPreview(preview, label) {
  const container = document.getElementById("previewContainer");
  if (!container) {
    return;
  }
  disposePreviewResources();
  container.innerHTML = "";
  if (!preview || !preview.available) {
    if (preview && preview.exportable) {
      container.textContent = I18n.t("view.previewNotGenerated");
    } else {
      container.textContent = I18n.t("view.previewNotAvailable");
    }
    return;
  }
  const url = previewItemUrl(label, "");
  if (preview.kind === "prefab") {
    renderPrefabPreview(container, preview, label);
    return;
  }
  if (preview.kind === "image") {
    const node = createMediaNode("image", url, preview.type, label);
    container.appendChild(node);
    return;
  }
  if (preview.kind === "audio") {
    renderAudioPreview(container, preview, label);
    return;
  }
  if (preview.kind === "video") {
    const video = createMediaNode("video", url, preview.type, label);
    container.appendChild(video);
    return;
  }
  if (preview.kind === "model") {
    const viewer = createMediaNode("model", url, preview.type, label);
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
    setPreviewExportProgress({ visible: false });
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
  setPreviewExportProgress({ visible: false });
  renderOutputHint(hint, "", preview.outputDir);

  button.onclick = async () => {
    const token = ++previewExportRunToken;
    button.disabled = true;
    button.textContent = I18n.t("view.exporting");
    setPreviewExportProgress({
      visible: true,
      percent: 1,
      text: I18n.t("view.exportPhaseQueued"),
      state: "running",
    });
    renderOutputHint(hint, I18n.t("view.exportPhaseQueued"), preview.outputDir);

    try {
      const res = await fetch(
        `/api/entry/preview/export?label=${encodeURIComponent(
          label
        )}&force=1`,
        {
          method: "POST",
          headers: { "Accept": "application/json" },
        }
      );
      if (!res.ok) {
        const message = (await res.text()).trim();
        throw new Error(message || I18n.t("view.exportFailed"));
      }
      const payload = await res.json();
      const taskId = payload?.task?.id;
      if (!taskId) {
        throw new Error(I18n.t("view.exportFailed"));
      }
      await pollPreviewExportTask(taskId, token);
    } catch (err) {
      if (previewExportRunToken !== token) {
        return;
      }
      setPreviewExportProgress({
        visible: true,
        percent: 100,
        text: err.message || I18n.t("view.exportFailed"),
        state: "error",
      });
      renderOutputHint(
        hint,
        err.message || I18n.t("view.exportFailed"),
        preview.outputDir
      );
      button.disabled = false;
      button.textContent = I18n.t("view.exportPreview");
      return;
    }

    if (previewExportRunToken !== token) {
      return;
    }
    setPreviewExportProgress({
      visible: true,
      percent: 100,
      text: I18n.t("view.exportPhaseDone"),
      state: "success",
    });
    await wait(180);
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
  renderParentList(data.parents);
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
