let allEntries = [];
let searchEntries = [];
let currentPage = 1;
let state = {
  query: "",
  field: "all",
  media: [],
  character: [],
  tags: [],
  songs: [],
  videoSources: [],
  namingPrefixes: [],
  namingSeries: [],
  namingCodeCharacters: [],
  namingVariants: [],
  chipMatchMode: "any",
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
let namingFilterConfig = {
  prefixes: [],
  series: [],
  codeCharacters: [],
  variants: [],
  songs: [],
  videoSources: [],
};
let filterCountCache = {
  media: new Map(),
  character: new Map(),
  tags: new Map(),
};
const filterPanelDefaults = {
  media: { collapsed: false, searchable: false, limit: 20 },
  character: { collapsed: false, searchable: false, limit: 20 },
  tags: { collapsed: false, searchable: true, limit: 32 },
  songs: { collapsed: true, searchable: true, limit: 28 },
  videoSources: { collapsed: false, searchable: true, limit: 18 },
  namingPrefixes: { collapsed: true, searchable: true, limit: 24 },
  namingSeries: { collapsed: true, searchable: true, limit: 42 },
  namingCodeCharacters: { collapsed: true, searchable: true, limit: 24 },
  namingVariants: { collapsed: true, searchable: true, limit: 24 },
};
let filterPanelState = {};

const characterCodeMap = {
  "1021": { key: "kozue", name: "Kozue" },
  "1022": { key: "tsuzuri", name: "Tsuzuri" },
  "1023": { key: "megumi", name: "Megumi" },
  "1031": { key: "kaho", name: "Kaho" },
  "1032": { key: "sayaka", name: "Sayaka" },
  "1033": { key: "rurino", name: "Rurino" },
  "1041": { key: "ginko", name: "Ginko" },
  "1042": { key: "kosuzu", name: "Kosuzu" },
  "1043": { key: "hime", name: "Hime" },
  "1051": { key: "izumi", name: "Izumi" },
  "1052": { key: "ceras", name: "Ceras" },
  "9007": { key: "sachi", name: "Sachi" },
};

const defaultCostumeSeriesHints = {
  "1001": "冬季校服 / Winter Uniform",
  "1002": "夏季校服 / Summer Uniform",
  "1003": "夏季校服(变体) / Summer Uniform (Alt)",
  "1004": "冬季运动服 / Winter Sportswear",
  "1005": "夏季运动服 / Summer Sportswear",
  "1006": "冬季校服(差分) / Winter Uniform (Alt)",
  "1007": "冬季大衣 / Winter Coat",
  "1008": "冬季校服(特例) / Winter Uniform (Special)",
  "1009": "瑞河夏季校服 / Mizukawa Summer Uniform",
  "1010": "瑞河冬季大衣 / Mizukawa Winter Coat",
  "2001": "滑冰服 / Skating Outfit",
  "2002": "夏季校服(围裙) / Summer Uniform (Apron)",
  "2003": "浴巾造型 / Bath Towel",
  "2004": "睡衣 / Pajamas",
  "2006": "滑冰服 / Skating Outfit",
  "2007": "夏季私服 / Summer Casual",
  "2008": "家居服 / Homewear",
  "2009": "滑冰比赛服 / Skating Competition",
  "2014": "泳衣 / Swimsuit",
  "2015": "Tsuzuri家睡衣 / Tsuzuri House Pajamas",
  "2016": "店员服 / Staff Uniform",
  "2017": "睡衣(差分) / Pajamas (Alt)",
  "2019": "和服 / Kimono",
  "2020": "春秋私服 / Spring-Autumn Casual",
  "2021": "冬季私服 / Winter Casual",
  "2022": "夏季私服 / Summer Casual",
  "2023": "大学私服 / College Casual",
  "3001": "DB打歌服 / Performance Costume",
};

let costumeSeriesHints = { ...defaultCostumeSeriesHints };
let costumeSeriesLoadPromise = null;
let costumeModelHints = {};
let musicMetaByMusicId = {};
let musicMetaBySoundId = {};
let mediaMetaByLabel = {};

const bgmSoundIdLabelRE = /^bgm_(?:live|preview)_(\d+)\.(?:acb|awb)$/i;
const lyricVideoMusicIdLabelRE = /^music_lyric_video_(\d+)\.usm$/i;
const videoSourceLabelKeys = {
  advDigest: "search.videoSource.advDigest",
  tutorial: "search.videoSource.tutorial",
  memberIntro: "search.videoSource.memberIntro",
  fesLive: "search.videoSource.fesLive",
  styleMovie: "search.videoSource.styleMovie",
  memberVoice: "search.videoSource.memberVoice",
  styleVoice: "search.videoSource.styleVoice",
  cardGetMovie: "search.videoSource.cardGetMovie",
};

const namingPrefixHints = {
  "3d_costume": "3D Costume",
  "3d_face": "3D Face",
  "3d_hair": "3D Hair",
  "3d_accessory": "3D Accessory",
  "3d_item": "3D Item",
  "3d_prop": "3D Prop",
  "3d_stage": "3D Stage",
  bgm: "BGM",
  vo: "Voice",
  se: "SFX",
  story: "Story",
  quest: "Quest",
  mot: "Motion",
  ui: "UI",
  icon: "Icon",
};

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

function detectNamingPrefix(label) {
  const normalized = String(label || "").trim().toLowerCase();
  if (!normalized) {
    return "";
  }
  const parts = normalized.split("_").filter(Boolean);
  if (!parts.length) {
    return "";
  }
  if (parts[0] === "3d" && parts.length >= 2) {
    return `3d_${parts[1]}`;
  }
  return parts[0];
}

function inferCharacterCode(digits) {
  const normalized = String(digits || "");
  if (!normalized) {
    return "";
  }
  if (normalized.length === 10) {
    return normalized.slice(4, 8);
  }
  if (normalized.length >= 6) {
    const head = normalized.slice(0, 4);
    if (characterCodeMap[head]) {
      return head;
    }
    let best = "";
    let bestPos = -1;
    Object.keys(characterCodeMap).forEach((code) => {
      const pos = normalized.lastIndexOf(code);
      if (pos > bestPos) {
        best = code;
        bestPos = pos;
      }
    });
    if (best) {
      return best;
    }
    return head;
  }
  return "";
}

function inferVariantCode(digits) {
  const normalized = String(digits || "");
  if (normalized.length < 2) {
    return "";
  }
  return normalized.slice(-2);
}

function entryTraits(entry) {
  if (entry._traits) {
    return entry._traits;
  }

  const label = String(entry.label || "").trim();
  const normalized = label.toLowerCase();
  const traits = {
    prefix: detectNamingPrefix(normalized),
    isCostume: false,
    digits: "",
    seriesCode: "",
    characterCode: "",
    characterKey: "",
    characterName: "",
    variantCode: "",
    modelLabel: "",
    musicId: "",
    soundId: "",
    songTitle: "",
    songAliases: [],
    videoSource: "",
    videoMetaId: "",
    videoTitle: "",
    videoAliases: [],
  };

  const costumeMatch = normalized.match(/^3d_costume_(\d{10})$/);
  if (costumeMatch) {
    traits.isCostume = true;
    traits.digits = costumeMatch[1];
    traits.seriesCode = traits.digits.slice(0, 4);
    traits.characterCode = inferCharacterCode(traits.digits);
    traits.variantCode = inferVariantCode(traits.digits);
  } else {
    const genericDigits = normalized.match(/^3d_[a-z0-9]+_(\d{6,10})$/);
    if (genericDigits) {
      traits.digits = genericDigits[1];
      traits.characterCode = inferCharacterCode(traits.digits);
      if (
        traits.prefix === "3d_face" ||
        traits.prefix === "3d_hair" ||
        traits.prefix === "3d_costume"
      ) {
        traits.variantCode = inferVariantCode(traits.digits);
      }
    }
  }

  if (traits.isCostume && traits.digits && costumeModelHints[traits.digits]) {
    const modelHint = costumeModelHints[traits.digits];
    if (modelHint.seriesCode) {
      traits.seriesCode = String(modelHint.seriesCode).padStart(4, "0");
    }
    if (modelHint.characterCode) {
      traits.characterCode = String(modelHint.characterCode).padStart(4, "0");
    }
    if (modelHint.hairStyleId) {
      traits.variantCode = String(modelHint.hairStyleId).padStart(2, "0");
    }
    if (modelHint.label) {
      traits.modelLabel = modelHint.label;
    }
  }

  if (traits.characterCode && characterCodeMap[traits.characterCode]) {
    traits.characterKey = characterCodeMap[traits.characterCode].key;
    traits.characterName = characterCodeMap[traits.characterCode].name;
  }

  const songMeta = resolveSongMetaByLabel(label);
  if (songMeta) {
    traits.musicId = normalizeMusicId(songMeta.musicId);
    traits.soundId = normalizeSoundId(songMeta.soundId);
    traits.songTitle = String(songMeta.title || "").trim();
    traits.songAliases = Array.isArray(songMeta.aliases)
      ? songMeta.aliases.filter(Boolean)
      : [];
  }

  const mediaMeta = resolveMediaMetaByLabel(label);
  if (mediaMeta) {
    traits.videoSource = String(mediaMeta.source || "").trim();
    traits.videoMetaId = String(mediaMeta.id || "").trim();
    traits.videoTitle = String(mediaMeta.title || "").trim();
    traits.videoAliases = Array.isArray(mediaMeta.aliases)
      ? mediaMeta.aliases.filter(Boolean)
      : [];
  }

  entry._traits = traits;
  return traits;
}

function entrySearchText(entry) {
  if (!entry._searchText) {
    const parts = [
      entry.label || "",
      entry.realName || "",
      entry.type || "",
      Array.isArray(entry.contentTypes) ? entry.contentTypes.join(" ") : "",
      Array.isArray(entry.categories) ? entry.categories.join(" ") : "",
    ];
    const traits = entryTraits(entry);
    if (traits.prefix) {
      parts.push(traits.prefix);
    }
    if (traits.seriesCode) {
      parts.push(traits.seriesCode);
    }
    if (traits.characterCode) {
      parts.push(traits.characterCode);
    }
    if (traits.characterKey) {
      parts.push(traits.characterKey);
    }
    if (traits.characterName) {
      parts.push(traits.characterName);
    }
    if (traits.variantCode) {
      parts.push(`variant${traits.variantCode}`);
      parts.push(traits.variantCode);
    }
    if (traits.musicId) {
      parts.push(traits.musicId);
    }
    if (traits.soundId) {
      parts.push(traits.soundId);
    }
    if (traits.songTitle) {
      parts.push(traits.songTitle);
    }
    if (Array.isArray(traits.songAliases) && traits.songAliases.length) {
      parts.push(traits.songAliases.join(" "));
    }
    if (traits.videoSource) {
      parts.push(traits.videoSource);
      parts.push(formatVideoSourceLabel(traits.videoSource));
    }
    if (traits.videoMetaId) {
      parts.push(traits.videoMetaId);
    }
    if (traits.videoTitle) {
      parts.push(traits.videoTitle);
    }
    if (Array.isArray(traits.videoAliases) && traits.videoAliases.length) {
      parts.push(traits.videoAliases.join(" "));
    }
    if (traits.modelLabel) {
      parts.push(traits.modelLabel);
    }
    entry._searchText = parts.filter(Boolean).join(" ");
  }
  return entry._searchText;
}

function entryTokens(entry) {
  if (!entry._tokens) {
    const text = entrySearchText(entry);
    entry._tokens = FilterUtils ? FilterUtils.tokenizeLabel(text) : [];
  }
  return entry._tokens;
}

function normalizeChipMatchMode(mode) {
  return mode === "all" ? "all" : "any";
}

function chipMatchModeIsAny() {
  return normalizeChipMatchMode(state.chipMatchMode) !== "all";
}

function groupMatch(entry, filters) {
  if (!Array.isArray(filters) || !filters.length || !window.FilterUtils) {
    return true;
  }
  const label = entrySearchText(entry);
  const tokens = entryTokens(entry);
  if (chipMatchModeIsAny()) {
    return filters.some((filter) => FilterUtils.matchLabel(label, filter, tokens));
  }
  return filters.every((filter) => FilterUtils.matchLabel(label, filter, tokens));
}

async function buildConfigFilterCounts(entries) {
  const next = {
    media: new Map(),
    character: new Map(),
    tags: new Map(),
  };
  if (!window.FilterConfig || !window.FilterUtils) {
    filterCountCache = next;
    return;
  }
  const groups = [
    { key: "media", filters: FilterConfig.media || [] },
    { key: "character", filters: FilterConfig.characters || [] },
    { key: "tags", filters: FilterConfig.tags || [] },
  ];
  groups.forEach((group) => {
    group.filters.forEach((filter) => {
      if (!filter?.key) {
        return;
      }
      next[group.key].set(filter.key, 0);
    });
  });

  const source = Array.isArray(entries) ? entries : [];
  for (let entryIndex = 0; entryIndex < source.length; entryIndex += 1) {
    const entry = source[entryIndex];
    const label = entrySearchText(entry);
    const tokens = entryTokens(entry);
    groups.forEach((group) => {
      group.filters.forEach((filter) => {
        if (!filter?.key) {
          return;
        }
        if (FilterUtils.matchLabel(label, filter, tokens)) {
          next[group.key].set(
            filter.key,
            Number(next[group.key].get(filter.key) || 0) + 1
          );
        }
      });
    });
    if ((entryIndex + 1) % 450 === 0) {
      await yieldToUI();
    }
  }
  filterCountCache = next;
}

function annotateFiltersWithCounts(filters, countMap) {
  const map = countMap instanceof Map ? countMap : new Map();
  return (Array.isArray(filters) ? filters : []).map((filter) => ({
    ...filter,
    count: map.has(filter.key) ? map.get(filter.key) : undefined,
  }));
}

function bumpCounter(counter, key) {
  if (!key) {
    return;
  }
  counter.set(key, (counter.get(key) || 0) + 1);
}

function formatNamingPrefixLabel(prefix) {
  if (namingPrefixHints[prefix]) {
    return namingPrefixHints[prefix];
  }
  return prefix;
}

function formatSeriesLabel(code) {
  const hint = costumeSeriesHints[code];
  if (hint) {
    return `${code} · ${hint}`;
  }
  return code;
}

function formatCodeCharacterLabel(code) {
  const mapped = characterCodeMap[code];
  if (mapped) {
    return `${mapped.name} (${code})`;
  }
  return code;
}

function formatVariantLabel(code) {
  if (!code) {
    return "";
  }
  if (code === "01") {
    return "01 · Default";
  }
  return `${code} · Variant`;
}

function normalizeYamlValue(raw) {
  const value = String(raw || "").trim();
  if (
    (value.startsWith("\"") && value.endsWith("\"")) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function parseSimpleYamlList(text) {
  const items = [];
  let current = null;
  String(text || "")
    .split(/\r?\n/)
    .forEach((line) => {
      const startMatch = line.match(/^\s*-\s+([A-Za-z0-9_]+):\s*(.*)\s*$/);
      if (startMatch) {
        if (current) {
          items.push(current);
        }
        current = {};
        current[startMatch[1]] = normalizeYamlValue(startMatch[2]);
        return;
      }
      const fieldMatch = line.match(/^\s+([A-Za-z0-9_]+):\s*(.*)\s*$/);
      if (!fieldMatch || !current) {
        return;
      }
      current[fieldMatch[1]] = normalizeYamlValue(fieldMatch[2]);
    });
  if (current) {
    items.push(current);
  }
  return items;
}

function toCharacterKey(rawName, fallbackId) {
  const normalized = String(rawName || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
  if (normalized) {
    return normalized;
  }
  return fallbackId ? `char${fallbackId}` : "";
}

function normalizeMusicId(raw) {
  return String(raw || "")
    .trim()
    .replace(/^0+/, "");
}

function normalizeSoundId(raw) {
  return String(raw || "").trim();
}

function musicTitleCandidatesForId(musicId, liveMusicMap) {
  const values = liveMusicMap[musicId];
  if (!values) {
    return [];
  }
  return Array.from(values).filter(Boolean);
}

function resolveSongMetaByLabel(label) {
  const normalized = String(label || "").trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  const bgmMatch = normalized.match(bgmSoundIdLabelRE);
  if (bgmMatch) {
    const soundId = normalizeSoundId(bgmMatch[1]);
    const fromSound = musicMetaBySoundId[soundId];
    if (fromSound) {
      return fromSound;
    }
  }

  const lyricMatch = normalized.match(lyricVideoMusicIdLabelRE);
  if (lyricMatch) {
    const musicId = normalizeMusicId(lyricMatch[1]);
    const fromMusic = musicMetaByMusicId[musicId];
    if (fromMusic) {
      return fromMusic;
    }
  }
  return null;
}

function formatSongLabel(musicId) {
  const normalized = normalizeMusicId(musicId);
  const meta = musicMetaByMusicId[normalized];
  if (!meta) {
    return normalized;
  }
  const title = String(meta.title || "").trim();
  if (!title) {
    return normalized;
  }
  return `${title} (${normalized})`;
}

function normalizeLabelKey(raw) {
  return String(raw || "").trim().toLowerCase();
}

function resolveMediaMetaByLabel(label) {
  const key = normalizeLabelKey(label);
  if (!key) {
    return null;
  }
  return mediaMetaByLabel[key] || null;
}

function toIntString(raw) {
  const text = String(raw || "").trim();
  if (!text) {
    return "";
  }
  const parsed = Number.parseInt(text, 10);
  if (!Number.isFinite(parsed)) {
    return text;
  }
  return String(parsed);
}

function formatVideoSourceLabel(source) {
  const key = videoSourceLabelKeys[source];
  if (!key) {
    return source;
  }
  const translated = I18n.t(key);
  return translated === key ? source : translated;
}

function getFilterPanelState(group) {
  const key = String(group || "").trim();
  if (!key) {
    return {
      collapsed: false,
      searchable: false,
      limit: 24,
      query: "",
      showAll: false,
    };
  }
  if (!filterPanelState[key]) {
    const defaults = filterPanelDefaults[key] || {};
    filterPanelState[key] = {
      collapsed: Boolean(defaults.collapsed),
      searchable: Boolean(defaults.searchable),
      limit: Number(defaults.limit) > 0 ? Number(defaults.limit) : 24,
      query: "",
      showAll: false,
    };
  }
  return filterPanelState[key];
}

function resetFilterPanelSearchState() {
  Object.keys(filterPanelState).forEach((group) => {
    const panel = filterPanelState[group];
    if (!panel) {
      return;
    }
    panel.query = "";
    panel.showAll = false;
  });
}

function deriveVoiceAssetLabels(voiceName) {
  const raw = String(voiceName || "").trim().toLowerCase();
  if (!raw) {
    return [];
  }
  const result = new Set();
  const addBase = (base) => {
    const text = String(base || "").trim().toLowerCase();
    if (!text) {
      return;
    }
    result.add(`${text}.acb`);
    result.add(`${text}.awb`);
  };
  addBase(raw);
  addBase(raw.replace(/_\d{4,}$/, ""));
  const memberMatch = raw.match(/^(vo_(?:chara|title)_m\d{4})_/);
  if (memberMatch) {
    addBase(memberMatch[1]);
  }
  const styleMatch = raw.match(/^(vo_card_\d{7})_/);
  if (styleMatch) {
    addBase(styleMatch[1]);
  }
  return Array.from(result);
}

function loadCostumeSeriesHints() {
  if (costumeSeriesLoadPromise) {
    return costumeSeriesLoadPromise;
  }
  costumeSeriesLoadPromise = Promise.all([
    fetch("/api/masterdata/file?name=Costumes")
      .then((res) => (res.ok ? res.text() : ""))
      .catch(() => ""),
    fetch("/api/masterdata/file?name=CostumeModels")
      .then((res) => (res.ok ? res.text() : ""))
      .catch(() => ""),
    fetch("/api/masterdata/file?name=Characters")
      .then((res) => (res.ok ? res.text() : ""))
      .catch(() => ""),
    fetch("/api/masterdata/file?name=Musics")
      .then((res) => (res.ok ? res.text() : ""))
      .catch(() => ""),
    fetch("/api/masterdata/file?name=LiveMusic")
      .then((res) => (res.ok ? res.text() : ""))
      .catch(() => ""),
    fetch("/api/masterdata/file?name=AdvStoryDigestMovies")
      .then((res) => (res.ok ? res.text() : ""))
      .catch(() => ""),
    fetch("/api/masterdata/file?name=TutorialSchoolIdolStageMovies")
      .then((res) => (res.ok ? res.text() : ""))
      .catch(() => ""),
    fetch("/api/masterdata/file?name=MemberMovies")
      .then((res) => (res.ok ? res.text() : ""))
      .catch(() => ""),
    fetch("/api/masterdata/file?name=MemberVoices")
      .then((res) => (res.ok ? res.text() : ""))
      .catch(() => ""),
    fetch("/api/masterdata/file?name=LiveMovies")
      .then((res) => (res.ok ? res.text() : ""))
      .catch(() => ""),
    fetch("/api/masterdata/file?name=StyleMovies")
      .then((res) => (res.ok ? res.text() : ""))
      .catch(() => ""),
    fetch("/api/masterdata/file?name=StyleVoices")
      .then((res) => (res.ok ? res.text() : ""))
      .catch(() => ""),
    fetch("/api/masterdata/file?name=CardGetMovieSettings")
      .then((res) => (res.ok ? res.text() : ""))
      .catch(() => ""),
  ])
    .then(
      ([
        costumesText,
        costumeModelsText,
        charactersText,
        musicsText,
        liveMusicText,
        advStoryDigestMoviesText,
        tutorialSchoolIdolStageMoviesText,
        memberMoviesText,
        memberVoicesText,
        liveMoviesText,
        styleMoviesText,
        styleVoicesText,
        cardGetMovieSettingsText,
      ]) => {
      const nextSeriesHints = { ...defaultCostumeSeriesHints };
      if (costumesText) {
        parseSimpleYamlList(costumesText).forEach((row) => {
          const id = String(row.Id || "").trim();
          const label = String(row.Label || "").trim();
          if (!id || !label) {
            return;
          }
          const seriesCode = id.slice(0, 4);
          if (seriesCode) {
            nextSeriesHints[seriesCode] = label;
          }
        });
      }
      costumeSeriesHints = nextSeriesHints;

      if (charactersText) {
        parseSimpleYamlList(charactersText).forEach((row) => {
          const id = String(row.Id || "").trim();
          if (!id) {
            return;
          }
          const latinFirst = String(row.LatinAlphabetNameFirst || "").trim();
          const latinLast = String(row.LatinAlphabetNameLast || "").trim();
          const jpFirst = String(row.NameFirst || "").trim();
          const fallbackName = [latinFirst, latinLast].filter(Boolean).join(" ");
          const displayName = fallbackName || jpFirst || id;
          if (!characterCodeMap[id]) {
            characterCodeMap[id] = {
              key: toCharacterKey(latinFirst || displayName, id),
              name: displayName,
            };
            return;
          }
          if (displayName) {
            characterCodeMap[id].name = displayName;
          }
          if (!characterCodeMap[id].key) {
            characterCodeMap[id].key = toCharacterKey(latinFirst || displayName, id);
          }
        });
      }

      const nextCostumeModelHints = {};
      if (costumeModelsText) {
        parseSimpleYamlList(costumeModelsText).forEach((row) => {
          const id = String(row.Id || "").trim();
          if (!id) {
            return;
          }
          const fullId = id.padStart(10, "0");
          nextCostumeModelHints[fullId] = {
            label: String(row.Label || "").trim(),
            characterCode: String(row.CharactersId || "").trim(),
            seriesCode: String(row.CostumesId || "").trim(),
            hairStyleId: String(row.HairStyleId || "").trim(),
          };
        });
      }
      costumeModelHints = nextCostumeModelHints;
      const liveMusicMap = {};
      if (liveMusicText) {
        parseSimpleYamlList(liveMusicText).forEach((row) => {
          const musicId = normalizeMusicId(row.MusicId);
          const label = String(row.Label || "").trim();
          if (!musicId || !label) {
            return;
          }
          if (!liveMusicMap[musicId]) {
            liveMusicMap[musicId] = new Set();
          }
          liveMusicMap[musicId].add(label);
        });
      }

      const nextMusicMetaByMusicId = {};
      const nextMusicMetaBySoundId = {};
      if (musicsText) {
        parseSimpleYamlList(musicsText).forEach((row) => {
          const musicId = normalizeMusicId(row.Id);
          const soundId = normalizeSoundId(row.SoundId);
          const title = String(row.Title || "").trim();
          if (!musicId) {
            return;
          }
          const aliases = new Set();
          if (title) {
            aliases.add(title);
          }
          musicTitleCandidatesForId(musicId, liveMusicMap).forEach((value) =>
            aliases.add(value)
          );
          const meta = {
            musicId,
            soundId,
            title,
            aliases: Array.from(aliases),
          };
          nextMusicMetaByMusicId[musicId] = meta;
          if (soundId) {
            nextMusicMetaBySoundId[soundId] = meta;
          }
        });
      }

      const nextMediaMetaByLabel = {};
      const upsertMediaMeta = (assetLabel, source, id, title, aliases = []) => {
        const key = normalizeLabelKey(assetLabel);
        if (!key) {
          return;
        }
        const existing = nextMediaMetaByLabel[key] || {
          source: "",
          id: "",
          title: "",
          aliases: [],
        };
        if (!existing.source && source) {
          existing.source = source;
        }
        if (!existing.id && id) {
          existing.id = String(id);
        }
        if (!existing.title && title) {
          existing.title = String(title).trim();
        }
        const aliasSet = new Set(existing.aliases || []);
        if (existing.title) {
          aliasSet.add(existing.title);
        }
        if (existing.id) {
          aliasSet.add(existing.id);
        }
        (Array.isArray(aliases) ? aliases : []).forEach((value) => {
          const text = String(value || "").trim();
          if (text) {
            aliasSet.add(text);
          }
        });
        existing.aliases = Array.from(aliasSet);
        nextMediaMetaByLabel[key] = existing;
      };

      if (advStoryDigestMoviesText) {
        parseSimpleYamlList(advStoryDigestMoviesText).forEach((row) => {
          const id = toIntString(row.Id);
          const title = String(row.Title || "").trim();
          if (!id) {
            return;
          }
          const aliases = [title, `digest ${id}`];
          upsertMediaMeta(
            `picture_story_digest_${id}.usm`,
            "advDigest",
            id,
            title,
            aliases
          );
          upsertMediaMeta(
            `picture_story_digest_thumbnail_${id}`,
            "advDigest",
            id,
            title,
            aliases
          );
        });
      }

      if (tutorialSchoolIdolStageMoviesText) {
        parseSimpleYamlList(tutorialSchoolIdolStageMoviesText).forEach((row) => {
          const id = toIntString(row.Id);
          const title = String(row.Title || "").trim();
          if (!id) {
            return;
          }
          const aliases = [title, `tutorial ${id}`];
          upsertMediaMeta(
            `picture_schoolidolstage_tutorial_${id}.usm`,
            "tutorial",
            id,
            title,
            aliases
          );
          upsertMediaMeta(
            `picture_schoolidolstage_tutorial_thumbnail_${id}`,
            "tutorial",
            id,
            title,
            aliases
          );
        });
      }

      if (memberMoviesText) {
        parseSimpleYamlList(memberMoviesText).forEach((row) => {
          const id = toIntString(row.Id);
          if (!id) {
            return;
          }
          const characterCode = String(row.CharactersId || "").trim();
          const characterName = characterCodeMap[characterCode]
            ? characterCodeMap[characterCode].name
            : characterCode;
          const name = String(row.Name || "").trim();
          const title = [characterName, name].filter(Boolean).join(" ");
          const aliases = [name, characterName, String(row.ReleaseConditionText || "").trim()];
          upsertMediaMeta(
            `picture_introduction_${id}.usm`,
            "memberIntro",
            id,
            title,
            aliases
          );
          upsertMediaMeta(
            `picture_introduction_thumbnail_${id}`,
            "memberIntro",
            id,
            title,
            aliases
          );
        });
      }

      if (memberVoicesText) {
        parseSimpleYamlList(memberVoicesText).forEach((row) => {
          const id = toIntString(row.Id);
          const characterCode = String(row.CharactersId || "").trim();
          const characterName = characterCodeMap[characterCode]
            ? characterCodeMap[characterCode].name
            : characterCode;
          const name = String(row.Name || "").trim();
          const voiceName = String(row.VoiceName || "").trim();
          if (!voiceName) {
            return;
          }
          const aliases = [
            voiceName,
            name,
            characterName,
            id ? `voice ${id}` : "",
            String(row.ReleaseConditionText || "").trim(),
          ];
          const title = [characterName, name].filter(Boolean).join(" ");
          deriveVoiceAssetLabels(voiceName).forEach((assetLabel) => {
            upsertMediaMeta(
              assetLabel,
              "memberVoice",
              id || characterCode,
              title || characterName || id,
              aliases
            );
          });
        });
      }

      if (liveMoviesText) {
        parseSimpleYamlList(liveMoviesText).forEach((row) => {
          const id = toIntString(row.Id);
          const title = String(row.Label || "").trim();
          if (!id) {
            return;
          }
          const id4 = id.padStart(4, "0");
          const aliases = [title, `feslive ${id4}`];
          upsertMediaMeta(
            `feslive_movie_${id4}.usm`,
            "fesLive",
            id,
            title,
            aliases
          );
        });
      }

      if (styleMoviesText) {
        parseSimpleYamlList(styleMoviesText).forEach((row) => {
          const cardSeriesId = toIntString(row.CardSeriesId);
          if (!cardSeriesId) {
            return;
          }
          const movieType = toIntString(row.MovieType);
          const title = String(row.Name || "").trim();
          const aliases = [
            title,
            `card ${cardSeriesId}`,
            movieType ? `movie type ${movieType}` : "",
            String(row.ReleaseConditionText || "").trim(),
          ];
          [
            `picture_ur_get_${cardSeriesId}_in.usm`,
            `picture_ur_get_${cardSeriesId}_loop.usm`,
            `picture_ur_training_${cardSeriesId}_in.usm`,
            `picture_ur_training_${cardSeriesId}_loop.usm`,
            `picture_ur_home_${cardSeriesId}0.usm`,
            `picture_ur_home_${cardSeriesId}1.usm`,
          ].forEach((assetLabel) => {
            upsertMediaMeta(
              assetLabel,
              "styleMovie",
              cardSeriesId,
              title || cardSeriesId,
              aliases
            );
          });
        });
      }

      if (styleVoicesText) {
        parseSimpleYamlList(styleVoicesText).forEach((row) => {
          const id = toIntString(row.Id);
          const cardSeriesId = toIntString(row.CardSeriesId);
          const name = String(row.Name || "").trim();
          const voiceName = String(row.VoiceName || "").trim();
          if (!voiceName) {
            return;
          }
          const aliases = [
            voiceName,
            name,
            cardSeriesId ? `card ${cardSeriesId}` : "",
            id ? `voice ${id}` : "",
            String(row.ReleaseConditionText || "").trim(),
          ];
          deriveVoiceAssetLabels(voiceName).forEach((assetLabel) => {
            upsertMediaMeta(
              assetLabel,
              "styleVoice",
              id || cardSeriesId,
              name || cardSeriesId || id,
              aliases
            );
          });
        });
      }

      if (cardGetMovieSettingsText) {
        parseSimpleYamlList(cardGetMovieSettingsText).forEach((row) => {
          const id = toIntString(row.Id);
          if (!id) {
            return;
          }
          const startMs = toIntString(row.CardInfoDisplayStartTimeSeconds);
          const effectBackgroundId = toIntString(row.UrCardEffectBackgroundId);
          const positionType = toIntString(row.CardInfoPositionType);
          const cardSeriesId = id.length > 1 ? id.slice(0, -1) : "";
          const aliases = [
            cardSeriesId ? `card ${cardSeriesId}` : "",
            `movie ${id}`,
            startMs ? `start ${startMs}` : "",
            effectBackgroundId ? `bg ${effectBackgroundId}` : "",
            positionType ? `position ${positionType}` : "",
          ];
          upsertMediaMeta(
            `picture_ur_home_${id}.usm`,
            "cardGetMovie",
            id,
            `UR home ${id}`,
            aliases
          );
        });
      }
      musicMetaByMusicId = nextMusicMetaByMusicId;
      musicMetaBySoundId = nextMusicMetaBySoundId;
      mediaMetaByLabel = nextMediaMetaByLabel;
    }
    )
    .catch(() => {});
  return costumeSeriesLoadPromise;
}

function buildDynamicFilterItems(counter, formatter, selectedKeys, options = {}) {
  const {
    minCount = 1,
    limit = 24,
  } = options;
  const selected = new Set(Array.isArray(selectedKeys) ? selectedKeys : []);
  const sorted = Array.from(counter.entries()).sort((a, b) => {
    if (b[1] !== a[1]) {
      return b[1] - a[1];
    }
    return a[0].localeCompare(b[0]);
  });
  const items = [];
  sorted.forEach(([key, count]) => {
    if (count < minCount && !selected.has(key)) {
      return;
    }
    if (items.length >= limit && !selected.has(key)) {
      return;
    }
    items.push({
      key,
      label: formatter(key),
      count,
    });
  });
  selected.forEach((key) => {
    if (items.some((item) => item.key === key)) {
      return;
    }
    const count = counter.get(key) || 0;
    items.push({
      key,
      label: formatter(key),
      count,
    });
  });
  return items;
}

function buildNamingFilters(entries) {
  const prefixCounter = new Map();
  const seriesCounter = new Map();
  const codeCharacterCounter = new Map();
  const variantCounter = new Map();
  const songCounter = new Map();
  const videoSourceCounter = new Map();

  entries.forEach((entry) => {
    const traits = entryTraits(entry);
    bumpCounter(prefixCounter, traits.prefix);
    bumpCounter(seriesCounter, traits.seriesCode);
    bumpCounter(codeCharacterCounter, traits.characterCode);
    bumpCounter(variantCounter, traits.variantCode);
    bumpCounter(songCounter, traits.musicId);
    bumpCounter(videoSourceCounter, traits.videoSource);
  });

  namingFilterConfig = {
    prefixes: buildDynamicFilterItems(
      prefixCounter,
      formatNamingPrefixLabel,
      state.namingPrefixes,
      { minCount: 2, limit: 28 }
    ),
    series: buildDynamicFilterItems(
      seriesCounter,
      formatSeriesLabel,
      state.namingSeries,
      { minCount: 1, limit: 80 }
    ),
    codeCharacters: buildDynamicFilterItems(
      codeCharacterCounter,
      formatCodeCharacterLabel,
      state.namingCodeCharacters,
      { minCount: 1, limit: 24 }
    ),
    variants: buildDynamicFilterItems(
      variantCounter,
      formatVariantLabel,
      state.namingVariants,
      { minCount: 1, limit: 24 }
    ),
    songs: buildDynamicFilterItems(
      songCounter,
      formatSongLabel,
      state.songs,
      { minCount: 1, limit: 120 }
    ),
    videoSources: buildDynamicFilterItems(
      videoSourceCounter,
      formatVideoSourceLabel,
      state.videoSources,
      { minCount: 1, limit: 12 }
    ),
  };
}

function entryNamingSummary(entry) {
  const traits = entryTraits(entry);
  const parts = [];
  if (traits.seriesCode) {
    parts.push(formatSeriesLabel(traits.seriesCode));
  } else if (traits.prefix) {
    parts.push(formatNamingPrefixLabel(traits.prefix));
  }
  if (traits.modelLabel) {
    parts.push(traits.modelLabel);
  }
  if (traits.characterCode) {
    parts.push(formatCodeCharacterLabel(traits.characterCode));
  }
  if (traits.variantCode) {
    parts.push(formatVariantLabel(traits.variantCode));
  }
  if (traits.songTitle) {
    parts.push(traits.songTitle);
  }
  if (traits.videoTitle && !parts.includes(traits.videoTitle)) {
    parts.push(traits.videoTitle);
  }
  return parts.join(" • ");
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
    const namingSummary = entryNamingSummary(entry);
    if (namingSummary) {
      extraMetaParts.push(namingSummary);
    }
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

  const summaryNode = document.getElementById("searchSummary");
  if (summaryNode) {
    if (allEntries.length > 0 && searchEntries.length !== allEntries.length) {
      summaryNode.textContent = I18n.t("search.entriesFiltered", {
        count: App.formatNumber(searchEntries.length),
        total: App.formatNumber(allEntries.length),
      });
    } else {
      summaryNode.textContent = I18n.t("search.entries", {
        count: App.formatNumber(searchEntries.length),
      });
    }
  }
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
        filtered = filtered.filter((entry) => groupMatch(entry, mediaFilters));
      }
    }

    if (state.character.length > 0) {
      const charFilters = state.character
        .map((key) => FilterConfig.characters.find((item) => item.key === key))
        .filter(Boolean);
      if (charFilters.length > 0) {
        filtered = filtered.filter((entry) => groupMatch(entry, charFilters));
      }
    }

    if (state.tags.length > 0 && FilterConfig.tags) {
      const tagFilters = state.tags
        .map((key) => FilterConfig.tags.find((item) => item.key === key))
        .filter(Boolean);
      if (tagFilters.length > 0) {
        filtered = filtered.filter((entry) => groupMatch(entry, tagFilters));
      }
    }
  }

  if (state.songs.length > 0) {
    filtered = filtered.filter((entry) => {
      const traits = entryTraits(entry);
      return state.songs.includes(traits.musicId);
    });
  }

  if (state.videoSources.length > 0) {
    filtered = filtered.filter((entry) => {
      const traits = entryTraits(entry);
      return state.videoSources.includes(traits.videoSource);
    });
  }

  if (state.namingPrefixes.length > 0) {
    filtered = filtered.filter((entry) => {
      const traits = entryTraits(entry);
      return state.namingPrefixes.includes(traits.prefix);
    });
  }

  if (state.namingSeries.length > 0) {
    filtered = filtered.filter((entry) => {
      const traits = entryTraits(entry);
      return state.namingSeries.includes(traits.seriesCode);
    });
  }

  if (state.namingCodeCharacters.length > 0) {
    filtered = filtered.filter((entry) => {
      const traits = entryTraits(entry);
      return state.namingCodeCharacters.includes(traits.characterCode);
    });
  }

  if (state.namingVariants.length > 0) {
    filtered = filtered.filter((entry) => {
      const traits = entryTraits(entry);
      return state.namingVariants.includes(traits.variantCode);
    });
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
  if (state.songs.length > 0) {
    params.set("songs", state.songs.join(","));
  }
  if (state.videoSources.length > 0) {
    params.set("videoSource", state.videoSources.join(","));
  }
  if (state.namingPrefixes.length > 0) {
    params.set("nPrefix", state.namingPrefixes.join(","));
  }
  if (state.namingSeries.length > 0) {
    params.set("nSeries", state.namingSeries.join(","));
  }
  if (state.namingCodeCharacters.length > 0) {
    params.set("nChar", state.namingCodeCharacters.join(","));
  }
  if (state.namingVariants.length > 0) {
    params.set("nVar", state.namingVariants.join(","));
  }
  if (normalizeChipMatchMode(state.chipMatchMode) !== "any") {
    params.set("chipMode", normalizeChipMatchMode(state.chipMatchMode));
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
  params.set("withMeta", "1");
  if (needsModifiedTime()) {
    params.set("withModTime", "1");
  }
  const data = await App.apiGet(`/api/search?${params.toString()}`);
  allEntries = data;
  await loadCostumeSeriesHints();
  allEntries.forEach((entry) => {
    entry._tokens = null;
    entry._searchText = "";
    entry._traits = null;
  });
  buildNamingFilters(allEntries);
  if (window.FilterUtils && FilterUtils.loadConfig) {
    await FilterUtils.loadConfig();
  }
  await buildConfigFilterCounts(allEntries);
  buildTypeFilter();
  renderFilterChips();
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
  const chipMatchSelect = document.getElementById("chipMatchMode");
  const clearFiltersButton = document.getElementById("searchClearFilters");
  if (chipMatchSelect) {
    chipMatchSelect.value = normalizeChipMatchMode(state.chipMatchMode);
    chipMatchSelect.addEventListener("change", () => {
      state.chipMatchMode = normalizeChipMatchMode(chipMatchSelect.value);
      currentPage = 1;
      updateUrl();
      applyFilters().catch(() => {});
      renderFilterChips();
    });
  }
  if (clearFiltersButton) {
    clearFiltersButton.addEventListener("click", () => {
      state.media = [];
      state.character = [];
      state.tags = [];
      state.songs = [];
      state.videoSources = [];
      state.namingPrefixes = [];
      state.namingSeries = [];
      state.namingCodeCharacters = [];
      state.namingVariants = [];
      state.type = "";
      state.chipMatchMode = "any";
      const typeFilter = document.getElementById("typeFilter");
      if (typeFilter) {
        typeFilter.value = "";
      }
      if (chipMatchSelect) {
        chipMatchSelect.value = "any";
      }
      resetFilterPanelSearchState();
      currentPage = 1;
      updateUrl();
      applyFilters().catch(() => {});
      renderFilterChips();
    });
  }
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
    currentPage = 1;
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
      songs: [],
      videoSources: [],
      namingPrefixes: [],
      namingSeries: [],
      namingCodeCharacters: [],
      namingVariants: [],
      chipMatchMode: "any",
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
    if (chipMatchSelect) {
      chipMatchSelect.value = "any";
    }
    resetFilterPanelSearchState();
    currentPage = 1;
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
  state.songs = parseParamList(params.get("songs"))
    .map((item) => normalizeMusicId(item))
    .filter(Boolean);
  state.videoSources = parseParamList(params.get("videoSource"));
  state.namingPrefixes = parseParamList(params.get("nPrefix"));
  state.namingSeries = parseParamList(params.get("nSeries"));
  state.namingCodeCharacters = parseParamList(params.get("nChar"));
  state.namingVariants = parseParamList(params.get("nVar"));
  state.chipMatchMode = normalizeChipMatchMode(params.get("chipMode") || "any");
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
    annotateFiltersWithCounts(
      window.FilterConfig ? FilterConfig.media : [],
      filterCountCache.media
    ),
    state.media,
    (key) => toggleFilter("media", key),
    { group: "media" }
  );

  renderFilterGroup(
    document.getElementById("characterFilters"),
    annotateFiltersWithCounts(
      window.FilterConfig ? FilterConfig.characters : [],
      filterCountCache.character
    ),
    state.character,
    (key) => toggleFilter("character", key),
    { group: "character" }
  );

  renderFilterGroup(
    document.getElementById("tagFilters"),
    annotateFiltersWithCounts(
      window.FilterConfig && FilterConfig.tags ? FilterConfig.tags : [],
      filterCountCache.tags
    ),
    state.tags,
    (key) => toggleFilter("tags", key),
    { group: "tags" }
  );

  renderFilterGroup(
    document.getElementById("songFilters"),
    namingFilterConfig.songs || [],
    state.songs,
    (key) => toggleFilter("songs", key),
    { group: "songs" }
  );

  renderFilterGroup(
    document.getElementById("videoSourceFilters"),
    namingFilterConfig.videoSources || [],
    state.videoSources,
    (key) => toggleFilter("videoSources", key),
    { group: "videoSources" }
  );

  renderFilterGroup(
    document.getElementById("namingPrefixFilters"),
    namingFilterConfig.prefixes || [],
    state.namingPrefixes,
    (key) => toggleFilter("namingPrefixes", key),
    { group: "namingPrefixes" }
  );

  renderFilterGroup(
    document.getElementById("namingSeriesFilters"),
    namingFilterConfig.series || [],
    state.namingSeries,
    (key) => toggleFilter("namingSeries", key),
    { group: "namingSeries" }
  );

  renderFilterGroup(
    document.getElementById("namingCharacterFilters"),
    namingFilterConfig.codeCharacters || [],
    state.namingCodeCharacters,
    (key) => toggleFilter("namingCodeCharacters", key),
    { group: "namingCodeCharacters" }
  );

  renderFilterGroup(
    document.getElementById("namingVariantFilters"),
    namingFilterConfig.variants || [],
    state.namingVariants,
    (key) => toggleFilter("namingVariants", key),
    { group: "namingVariants" }
  );

  renderFilterStrategySummary();
  renderActiveFilterBar();
}

function filterLabelFromGroup(group, key) {
  if (!key) {
    return "";
  }
  const byConfig = (items) => {
    const target = (items || []).find((item) => item.key === key);
    if (!target) {
      return "";
    }
    return target.labelKey ? I18n.t(target.labelKey) : target.label || key;
  };
  if (group === "media") {
    return byConfig(window.FilterConfig ? FilterConfig.media : []);
  }
  if (group === "character") {
    return byConfig(window.FilterConfig ? FilterConfig.characters : []);
  }
  if (group === "tags") {
    return byConfig(window.FilterConfig ? FilterConfig.tags : []);
  }
  if (group === "songs") {
    return byConfig(namingFilterConfig.songs || []) || formatSongLabel(key);
  }
  if (group === "videoSources") {
    return (
      byConfig(namingFilterConfig.videoSources || []) ||
      formatVideoSourceLabel(key)
    );
  }
  if (group === "namingPrefixes") {
    return byConfig(namingFilterConfig.prefixes || []) || formatNamingPrefixLabel(key);
  }
  if (group === "namingSeries") {
    return byConfig(namingFilterConfig.series || []) || formatSeriesLabel(key);
  }
  if (group === "namingCodeCharacters") {
    return (
      byConfig(namingFilterConfig.codeCharacters || []) || formatCodeCharacterLabel(key)
    );
  }
  if (group === "namingVariants") {
    return byConfig(namingFilterConfig.variants || []) || formatVariantLabel(key);
  }
  return key;
}

function collectActiveFilters() {
  const groups = [
    "media",
    "character",
    "tags",
    "songs",
    "videoSources",
    "namingPrefixes",
    "namingSeries",
    "namingCodeCharacters",
    "namingVariants",
  ];
  const active = [];
  groups.forEach((group) => {
    (state[group] || []).forEach((key) => {
      active.push({
        group,
        key,
        label: filterLabelFromGroup(group, key),
      });
    });
  });
  if (state.type) {
    active.push({
      group: "type",
      key: state.type,
      label: `${I18n.t("search.typeLabel")}: ${state.type}`,
    });
  }
  return active;
}

function renderFilterStrategySummary() {
  const node = document.getElementById("activeFilterSummary");
  if (!node) {
    return;
  }
  const count = collectActiveFilters().length;
  node.textContent = I18n.t("search.activeFilters", {
    count: App.formatNumber(count),
    mode:
      normalizeChipMatchMode(state.chipMatchMode) === "all"
        ? I18n.t("search.matchModeAllShort")
        : I18n.t("search.matchModeAnyShort"),
  });
}

function renderActiveFilterBar() {
  const container = document.getElementById("activeFilterBar");
  if (!container) {
    return;
  }
  const items = collectActiveFilters();
  if (!items.length) {
    container.innerHTML = "";
    container.classList.add("d-none");
    return;
  }
  container.classList.remove("d-none");
  container.innerHTML = "";
  items.forEach((item) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "search-active-filter-pill";
    btn.textContent = `${item.label} ×`;
    btn.title = I18n.t("search.activeFilterRemove");
    btn.addEventListener("click", () => {
      if (item.group === "type") {
        state.type = "";
        const select = document.getElementById("typeFilter");
        if (select) {
          select.value = "";
        }
      } else {
        const list = state[item.group] || [];
        const index = list.indexOf(item.key);
        if (index >= 0) {
          list.splice(index, 1);
        }
      }
      currentPage = 1;
      updateUrl();
      applyFilters().catch(() => {});
      renderFilterChips();
    });
    container.appendChild(btn);
  });
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
  currentPage = 1;
  updateUrl();
  applyFilters().catch(() => {});
  renderFilterChips();
}

function resolveFilterChipLabel(filter) {
  if (!filter) {
    return "";
  }
  if (filter.labelKey) {
    return I18n.t(filter.labelKey);
  }
  return filter.label || filter.key || "";
}

function ensureFilterGroupTools(container, group, payload) {
  const block = container ? container.closest(".filter-block") : null;
  if (!block) {
    return;
  }
  block.classList.add("filter-block-smart");
  const panel = getFilterPanelState(group);
  const activeCount = Number(payload.activeCount || 0);
  const totalCount = Number(payload.totalCount || 0);
  const hiddenCount = Number(payload.hiddenCount || 0);
  const allowSearch = Boolean(payload.allowSearch);
  const canCollapse = totalCount > 0;
  const collapsed = panel.collapsed && activeCount === 0;
  let toolbar = block.querySelector(".filter-block-tools");
  if (!toolbar) {
    toolbar = document.createElement("div");
    toolbar.className = "filter-block-tools";
    block.insertBefore(toolbar, container);
  }

  let searchInput = toolbar.querySelector(".filter-chip-search");
  if (!searchInput) {
    searchInput = document.createElement("input");
    searchInput.type = "search";
    searchInput.className = "form-control form-control-sm filter-chip-search";
    searchInput.setAttribute("autocomplete", "off");
    searchInput.addEventListener("input", () => {
      const next = searchInput.value.trim().toLowerCase();
      const current = getFilterPanelState(group);
      current.query = next;
      current.showAll = false;
      renderFilterChips();
    });
    toolbar.appendChild(searchInput);
  }
  searchInput.placeholder = I18n.t("search.filterSearchPlaceholder");
  searchInput.classList.toggle("d-none", !allowSearch && !panel.query);
  if (searchInput.value !== panel.query) {
    searchInput.value = panel.query || "";
  }

  let stats = toolbar.querySelector(".filter-block-count");
  if (!stats) {
    stats = document.createElement("span");
    stats.className = "filter-block-count text-muted";
    toolbar.appendChild(stats);
  }
  stats.textContent = `${App.formatNumber(activeCount)} / ${App.formatNumber(totalCount)}`;

  let actions = toolbar.querySelector(".filter-block-actions");
  if (!actions) {
    actions = document.createElement("div");
    actions.className = "filter-block-actions";
    toolbar.appendChild(actions);
  }

  let moreButton = actions.querySelector(".filter-more-btn");
  if (!moreButton) {
    moreButton = document.createElement("button");
    moreButton.type = "button";
    moreButton.className = "btn btn-outline-dark btn-sm filter-more-btn";
    moreButton.addEventListener("click", () => {
      const current = getFilterPanelState(group);
      current.showAll = !current.showAll;
      renderFilterChips();
    });
    actions.appendChild(moreButton);
  }
  moreButton.classList.toggle("d-none", hiddenCount <= 0);
  moreButton.textContent = panel.showAll
    ? I18n.t("search.filterShowLess")
    : I18n.t("search.filterShowMore", {
        count: App.formatNumber(hiddenCount),
      });

  let collapseButton = actions.querySelector(".filter-collapse-btn");
  if (!collapseButton) {
    collapseButton = document.createElement("button");
    collapseButton.type = "button";
    collapseButton.className = "btn btn-outline-dark btn-sm filter-collapse-btn";
    collapseButton.addEventListener("click", () => {
      const current = getFilterPanelState(group);
      current.collapsed = !current.collapsed;
      renderFilterChips();
    });
    actions.appendChild(collapseButton);
  }
  collapseButton.classList.toggle("d-none", !canCollapse);
  collapseButton.textContent = collapsed
    ? I18n.t("search.filterExpand")
    : I18n.t("search.filterCollapse");

  block.classList.toggle("is-collapsed", collapsed);
  container.classList.toggle("d-none", collapsed);
}

function renderFilterGroup(container, filters, activeKeys, onSelect, options = {}) {
  if (!container) {
    return;
  }
  const group = options.group || "";
  const panel = getFilterPanelState(group);
  const activeSet = new Set(Array.isArray(activeKeys) ? activeKeys : []);
  const list = Array.isArray(filters) ? filters : [];
  const query = String(panel.query || "").trim().toLowerCase();
  const items = list
    .map((filter) => ({
      filter,
      key: filter.key,
      label: resolveFilterChipLabel(filter),
      active: activeSet.has(filter.key),
    }))
    .filter((item) => {
      if (!query) {
        return true;
      }
      const haystack = `${item.key} ${item.label}`.toLowerCase();
      return haystack.includes(query);
    })
    .sort((a, b) => {
      if (a.active !== b.active) {
        return a.active ? -1 : 1;
      }
      const leftCount =
        typeof a.filter.count === "number" && a.filter.count >= 0 ? a.filter.count : -1;
      const rightCount =
        typeof b.filter.count === "number" && b.filter.count >= 0 ? b.filter.count : -1;
      if (rightCount !== leftCount) {
        return rightCount - leftCount;
      }
      return a.label.localeCompare(b.label);
    });

  const limit = Number(panel.limit) > 0 ? Number(panel.limit) : 24;
  let visible = items;
  let hiddenCount = 0;
  if (!panel.showAll && !query && items.length > limit) {
    const selectedItems = items.filter((item) => item.active);
    const normalItems = items.filter((item) => !item.active);
    const keep = Math.max(limit - selectedItems.length, 0);
    visible = selectedItems.concat(normalItems.slice(0, keep));
    hiddenCount = Math.max(items.length - visible.length, 0);
  }

  container.innerHTML = "";
  visible.forEach((item) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `filter-chip${item.active ? " active" : ""}`;
    if (typeof item.filter.count === "number" && item.filter.count >= 0) {
      button.textContent = `${item.label} (${App.formatNumber(item.filter.count)})`;
    } else {
      button.textContent = item.label;
    }
    button.addEventListener("click", () => onSelect(item.key));
    container.appendChild(button);
  });

  if (!visible.length && query) {
    const empty = document.createElement("div");
    empty.className = "filter-group-empty text-muted";
    empty.textContent = I18n.t("search.filterNoMatch");
    container.appendChild(empty);
  }

  ensureFilterGroupTools(container, group, {
    activeCount: activeSet.size,
    totalCount: list.length,
    hiddenCount,
    allowSearch:
      Boolean(panel.searchable) || query.length > 0 || list.length >= Math.max(limit, 12),
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
    currentPage = 1;
    updateUrl();
    applyFilters().catch(() => {});
    renderFilterChips();
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
