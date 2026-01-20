let masterFiles = [];
let activeName = null;

function renderList() {
  const filter = document.getElementById("masterFilter").value.toLowerCase();
  const list = document.getElementById("masterList");
  list.innerHTML = "";
  const filtered = masterFiles.filter((item) =>
    item.name.toLowerCase().includes(filter)
  );
  document.getElementById("masterCount").textContent = filtered.length;

  if (!filtered.length) {
    list.textContent = "No files found.";
    return;
  }

  filtered.forEach((item) => {
    const row = document.createElement("div");
    row.className = "list-item";
    if (item.name === activeName) {
      row.classList.add("active");
    }
    row.textContent = `${item.name} (${App.formatBytes(item.size)})`;
    row.addEventListener("click", () => selectFile(item.name));
    list.appendChild(row);
  });
}

async function selectFile(name) {
  activeName = name;
  const preview = document.getElementById("masterPreview");
  preview.textContent = "Loading...";
  const data = await fetch(`/api/masterdata/file?name=${encodeURIComponent(name)}`);
  if (!data.ok) {
    preview.textContent = "Failed to load file.";
    return;
  }
  preview.textContent = await data.text();
  const download = document.getElementById("masterDownload");
  download.setAttribute(
    "href",
    `/api/masterdata/file?name=${encodeURIComponent(name)}`
  );
  renderList();
}

async function loadMasterList() {
  try {
    masterFiles = await App.apiGet("/api/masterdata");
    renderList();
  } catch (err) {
    document.getElementById("masterList").textContent =
      "Failed to load masterdata.";
  }
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("masterFilter").addEventListener("input", renderList);
  loadMasterList();
});
