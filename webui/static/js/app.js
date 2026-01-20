const App = (() => {
  async function apiGet(url) {
    const res = await fetch(url, { headers: { "Accept": "application/json" } });
    if (!res.ok) {
      throw new Error(`Request failed: ${res.status}`);
    }
    return res.json();
  }

  async function apiPost(url, payload) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || `Request failed: ${res.status}`);
    }
    return res.json();
  }

  function formatBytes(bytes) {
    if (bytes === 0 || bytes === null || bytes === undefined) {
      return "0 B";
    }
    const units = ["B", "KB", "MB", "GB", "TB"];
    let idx = 0;
    let value = bytes;
    while (value >= 1024 && idx < units.length - 1) {
      value /= 1024;
      idx += 1;
    }
    return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[idx]}`;
  }

  function formatNumber(value) {
    if (value === null || value === undefined) {
      return "-";
    }
    return new Intl.NumberFormat().format(value);
  }

  return {
    apiGet,
    apiPost,
    formatBytes,
    formatNumber,
  };
})();
