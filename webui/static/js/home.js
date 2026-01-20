let taskStream = null;

function setStatusBadge(updated) {
  const badge = document.getElementById("statusUpdated");
  if (!badge) {
    return;
  }
  badge.classList.remove("badge", "badge-dark");
  if (updated) {
    badge.textContent = "Updated";
    badge.classList.add("badge");
  } else {
    badge.textContent = "Idle";
    badge.classList.add("badge-dark");
  }
}

async function loadStatus() {
  try {
    const data = await App.apiGet("/api/status");
    document.getElementById("statusVersion").textContent =
      data.version || "-";
    document.getElementById("statusCatalog").textContent = App.formatNumber(
      data.catalogEntries
    );
    document.getElementById("statusDb").textContent = App.formatNumber(
      data.dbEntries
    );
    document.getElementById("statusPlain").textContent = data.plainExists
      ? "Ready"
      : "Missing";
    document.getElementById("statusAssets").textContent = data.assetsExists
      ? "Ready"
      : "Missing";
    document.getElementById("statusMaster").textContent = App.formatNumber(
      data.masterCount
    );
    document.getElementById("statusModified").textContent = data.catalogLoaded
      ? `Catalog updated ${data.catalogModified}`
      : "Catalog not loaded.";
    setStatusBadge(data.updated);
  } catch (err) {
    document.getElementById("statusModified").textContent =
      "Failed to load status.";
  }
}

function appendLog(line) {
  const log = document.getElementById("taskLog");
  if (!log) {
    return;
  }
  if (log.textContent === "No task started.") {
    log.textContent = "";
  }
  log.textContent += `${line}\n`;
  log.scrollTop = log.scrollHeight;
}

function attachTaskStream(id) {
  if (taskStream) {
    taskStream.close();
  }
  const log = document.getElementById("taskLog");
  if (log) {
    log.textContent = "";
  }
  taskStream = new EventSource(`/sse/tasks/${id}`);
  taskStream.addEventListener("log", (event) => {
    const entry = JSON.parse(event.data);
    appendLog(`[${entry.time}] [${entry.level}] ${entry.message}`);
  });
  taskStream.onerror = () => {
    appendLog("Log stream closed.");
    taskStream.close();
  };
}

function renderTaskHistory(tasks) {
  const container = document.getElementById("taskHistory");
  if (!container) {
    return;
  }
  if (!tasks.length) {
    container.textContent = "No tasks yet.";
    return;
  }
  container.innerHTML = "";
  tasks
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .slice(0, 10)
    .forEach((task) => {
      const card = document.createElement("div");
      card.className = "task-card";
      const label = document.createElement("div");
      label.innerHTML = `<strong>${task.mode}</strong><div class="text-muted">${task.startedAt}</div>`;
      const status = document.createElement("div");
      status.innerHTML = `<span class="badge">${task.status}</span>`;
      card.appendChild(label);
      card.appendChild(status);
      card.addEventListener("click", () => attachTaskStream(task.id));
      container.appendChild(card);
    });
}

async function loadTasks() {
  try {
    const tasks = await App.apiGet("/api/tasks");
    renderTaskHistory(tasks);
    const running = tasks.find((task) => task.status === "running");
    if (running) {
      attachTaskStream(running.id);
    }
  } catch (err) {
    const container = document.getElementById("taskHistory");
    if (container) {
      container.textContent = "Failed to load tasks.";
    }
  }
}

function updateModeState() {
  const mode = document.getElementById("taskMode").value;
  const disableFields = mode === "convert" || mode === "master" || mode === "analyze";
  document.getElementById("taskClientVersion").disabled = disableFields;
  document.getElementById("taskResInfo").disabled = disableFields;
  document.getElementById("taskFilterRegex").disabled = disableFields;
}

function setupTaskForm() {
  const form = document.getElementById("taskForm");
  if (!form) {
    return;
  }
  document.getElementById("taskMode").addEventListener("change", updateModeState);
  updateModeState();
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = {
      mode: document.getElementById("taskMode").value,
      force: document.getElementById("taskForce").checked,
      keepRaw: document.getElementById("taskKeepRaw").checked,
      keepPath: document.getElementById("taskKeepPath").checked,
      clientVersion: document.getElementById("taskClientVersion").value,
      resInfo: document.getElementById("taskResInfo").value,
      filterRegex: document.getElementById("taskFilterRegex").value,
    };
    try {
      const data = await App.apiPost("/api/tasks", payload);
      attachTaskStream(data.id);
      loadTasks();
    } catch (err) {
      appendLog(`Task failed: ${err.message}`);
    }
  });

  const clearBtn = document.getElementById("taskClear");
  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      const log = document.getElementById("taskLog");
      if (log) {
        log.textContent = "No task started.";
      }
    });
  }
}

document.addEventListener("DOMContentLoaded", () => {
  loadStatus();
  loadTasks();
  setupTaskForm();
  setInterval(loadStatus, 15000);
});
