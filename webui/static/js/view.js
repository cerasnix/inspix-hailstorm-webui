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
const assemblyExportMemoryCache = new Map();
const assemblyExportPersistentCacheName = "inspix-hailstorm-assembly-glb-v1";
const prefabAssemblyTextureOverrideStorageKey =
  "hailstorm-prefab-assembly-texture-override-v1";
const prefabAssemblyLayoutPrefsStorageKey =
  "hailstorm-prefab-assembly-layout-v1";
const prefabAssemblyLayoutDefaults = Object.freeze({
  listWidth: 420,
  listHeight: 320,
  listColumns: "auto",
});
const rigBoneAliasMap = {
  hips: ["hips", "pelvis", "hip"],
  spine: ["spine", "spine1", "spine01", "spine2", "spine02"],
  chest: ["chest", "upperchest", "thorax", "torso"],
  neck: ["neck"],
  head: ["head"],
  leftShoulder: ["leftshoulder", "lshoulder", "leftclavicle", "lclavicle", "claviclel"],
  rightShoulder: ["rightshoulder", "rshoulder", "rightclavicle", "rclavicle", "clavicler"],
  leftUpperArm: ["leftupperarm", "lupperarm", "leftarm", "larm"],
  rightUpperArm: ["rightupperarm", "rupperarm", "rightarm", "rarm"],
  leftLowerArm: ["leftlowerarm", "lforearm", "leftforearm", "lowlarm"],
  rightLowerArm: ["rightlowerarm", "rforearm", "rightforearm", "rowlarm"],
  leftHand: ["lefthand", "lhand", "wristl", "leftwrist"],
  rightHand: ["righthand", "rhand", "wristr", "rightwrist"],
  leftUpperLeg: ["leftupperleg", "lthigh", "leftthigh", "uplegl"],
  rightUpperLeg: ["rightupperleg", "rthigh", "rightthigh", "uplegr"],
  leftLowerLeg: ["leftlowerleg", "lcalf", "leftcalf", "legl"],
  rightLowerLeg: ["rightlowerleg", "rcalf", "rightcalf", "legr"],
  leftFoot: ["leftfoot", "lfoot", "anklel", "leftankle"],
  rightFoot: ["rightfoot", "rfoot", "ankler", "rightankle"],
};
const assemblyTokenIgnoreSet = new Set([
  "assetbundle",
  "assets",
  "model",
  "mesh",
  "prefab",
  "dependency",
  "self",
  "mt",
  "mat",
  "fbx",
  "glb",
  "gltf",
]);
const stageTokenNoiseSet = new Set([
  "sc",
  "bg",
  "all",
  "root",
  "scene",
  "mesh",
  "combined",
  "gakuen",
  "utatsuyama",
]);

function isStageAssemblyRoot(label) {
  return String(label || "")
    .toLowerCase()
    .startsWith("3d_stage_");
}

function isStageAggregateSelfComponent(rootLabel, component = {}) {
  if (!isStageAssemblyRoot(rootLabel)) {
    return false;
  }
  if (String(component?.source || "").toLowerCase() !== "self") {
    return false;
  }
  const name = String(component?.name || "").toLowerCase();
  if (!name) {
    return false;
  }
  const root = String(rootLabel || "").toLowerCase();
  if (name.includes("combined mesh")) {
    return true;
  }
  if (name === `${root}.glb` || name === `${root}.gltf`) {
    return true;
  }
  return false;
}

function normalizeAssemblyIdentityText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/g, "")
    .replace(/^_+/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

function isStageAggregateDependencyComponent(
  rootLabel,
  component = {},
  ownerComponentCount = 0
) {
  if (!isStageAssemblyRoot(rootLabel)) {
    return false;
  }
  if (String(component?.source || "").toLowerCase() !== "dependency") {
    return false;
  }
  if (ownerComponentCount < 6) {
    return false;
  }
  const name = String(component?.name || "");
  const label = String(component?.label || "");
  if (!name || !label) {
    return false;
  }
  const nameId = normalizeAssemblyIdentityText(name);
  const labelId = normalizeAssemblyIdentityText(label);
  if (!nameId || !labelId) {
    return false;
  }
  if (nameId === labelId) {
    return true;
  }
  if (nameId.includes(labelId) || labelId.includes(nameId)) {
    return true;
  }
  return false;
}

function isStageAggregateComponent(
  rootLabel,
  component = {},
  ownerComponentCount = 0
) {
  return (
    isStageAggregateSelfComponent(rootLabel, component) ||
    isStageAggregateDependencyComponent(rootLabel, component, ownerComponentCount)
  );
}

function splitAssemblyTokens(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/g, "")
    .split(/[^a-z0-9]+/g)
    .map((token) => token.trim())
    .filter(
      (token) =>
        token.length >= 2 &&
        !assemblyTokenIgnoreSet.has(token) &&
        !/^\d+$/.test(token)
    );
}

function normalizeAssemblyComponentName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/g, "");
}

function stageAssemblyTextureGroupTag(name) {
  const text = normalizeAssemblyComponentName(name);
  if (!text) {
    return "misc";
  }
  if (/^\d{2}_/.test(text)) {
    return "campus_block";
  }
  if (text.startsWith("ground_outfield_road")) {
    return "ground_road";
  }
  if (text.startsWith("ground_outfield_")) {
    return "ground_outfield";
  }
  if (text.startsWith("ground_main")) {
    return "ground_main";
  }
  if (text.startsWith("kousya_")) {
    return "kousya";
  }
  if (text.startsWith("seimon_")) {
    return "seimon";
  }
  if (text.startsWith("light_emission")) {
    return "light_emission";
  }
  if (text.startsWith("snow_")) {
    return "snow";
  }
  if (text.startsWith("tree") || text.startsWith("trees_")) {
    return "trees";
  }
  if (text.startsWith("gaito")) {
    return "gaito";
  }
  if (text.startsWith("speaker_")) {
    return "speaker";
  }
  if (text.startsWith("sode_")) {
    return "stage_side";
  }
  const tokens = text.split(/[^a-z0-9]+/g).filter(Boolean);
  if (tokens.length >= 2) {
    return `${tokens[0]}_${tokens[1]}`;
  }
  if (tokens.length === 1) {
    return tokens[0];
  }
  return "misc";
}

function deriveAssemblyTextureGroupInfo(rootLabel, component = {}) {
  const owner = String(component?.label || rootLabel || "").trim();
  const name = String(component?.name || component?.itemId || "").trim();
  if (isStageAssemblyRoot(rootLabel)) {
    const tag = stageAssemblyTextureGroupTag(name);
    return {
      key: `${owner}|${tag}`,
      owner,
      tag,
    };
  }
  const domain = assemblyTextureDomain(name);
  const tokens = splitAssemblyTokens(name);
  const tag =
    domain && domain !== "unknown" ? domain : tokens.slice(0, 2).join("_") || "misc";
  return {
    key: `${owner}|${tag}`,
    owner,
    tag,
  };
}

function compactAssemblyTextureGroupLabel(label) {
  const text = String(label || "").trim();
  if (!text) {
    return "";
  }
  return text
    .replace(/^_+/g, "")
    .replace(/\.(png|jpe?g|webp|bmp|tga|dds|ktx2?|texture2d?|sprite)$/i, "");
}

function buildAssemblyTokenSet(values) {
  const set = new Set();
  (Array.isArray(values) ? values : [values]).forEach((value) => {
    splitAssemblyTokens(value).forEach((token) => set.add(token));
  });
  return set;
}

function buildAssemblyTokenList(values) {
  const out = [];
  (Array.isArray(values) ? values : [values]).forEach((value) => {
    splitAssemblyTokens(value).forEach((token) => out.push(token));
  });
  return out;
}

function filterStageSpecificTokens(tokens) {
  return (Array.isArray(tokens) ? tokens : [])
    .map((token) => String(token || "").trim().toLowerCase())
    .filter((token) => token.length >= 3 && !stageTokenNoiseSet.has(token));
}

function buildAssemblyTokenPhrases(values) {
  const tokens = filterStageSpecificTokens(buildAssemblyTokenList(values));
  const phrases = new Set();
  for (let i = 0; i < tokens.length - 1; i += 1) {
    const pair = `${tokens[i]}_${tokens[i + 1]}`;
    phrases.add(pair);
    if (i < tokens.length - 2) {
      phrases.add(`${pair}_${tokens[i + 2]}`);
    }
  }
  return phrases;
}

function looksLikeAssemblyIdentityToken(token) {
  const text = String(token || "").trim().toLowerCase();
  if (text.length < 6) {
    return false;
  }
  const hasLetters = /[a-z]{3,}/.test(text);
  const hasDigits = /\d{2,}/.test(text);
  return hasLetters && hasDigits;
}

function assemblyIdentityToken(value) {
  const tokens = splitAssemblyTokens(value);
  for (const token of tokens) {
    if (looksLikeAssemblyIdentityToken(token)) {
      return token;
    }
  }
  return "";
}

function assemblyIdentityFamily(token) {
  const text = String(token || "").trim().toLowerCase();
  if (!text) {
    return "";
  }
  if (text.length >= 7 && /[a-z]$/.test(text)) {
    return text.slice(0, -1);
  }
  return text;
}

function assemblyIdentityRoot(token) {
  const text = String(token || "").trim().toLowerCase();
  if (!text) {
    return "";
  }
  const compact = text.replace(/[^a-z0-9]/g, "");
  const strong = compact.match(/^([a-z]+[0-9]{2,}[a-z]{3})/);
  if (strong && strong[1]) {
    return strong[1];
  }
  const weak = compact.match(/^([a-z]+[0-9]{2,})/);
  if (weak && weak[1]) {
    return weak[1];
  }
  return "";
}

function assemblyCandidateIdentityState(candidate, ownerIdentity) {
  if (!ownerIdentity) {
    return "neutral";
  }
  const candidateIdentity = assemblyIdentityToken(candidate?.label || "");
  if (!candidateIdentity) {
    return "neutral";
  }
  if (candidateIdentity === ownerIdentity) {
    return "exact";
  }
  const ownerFamily = assemblyIdentityFamily(ownerIdentity);
  const candidateFamily = assemblyIdentityFamily(candidateIdentity);
  if (ownerFamily && candidateFamily && ownerFamily === candidateFamily) {
    return "family";
  }
  const ownerRoot = assemblyIdentityRoot(ownerIdentity);
  const candidateRoot = assemblyIdentityRoot(candidateIdentity);
  if (ownerRoot && candidateRoot && ownerRoot === candidateRoot) {
    return "related";
  }
  return "mismatch";
}

function assemblyTextureRoleWeight(role) {
  switch (String(role || "").trim().toLowerCase()) {
    case "albedo":
      return 90;
    case "lens":
      return 82;
    case "highlight":
      return 72;
    case "detail":
      return 36;
    case "detail2":
      return 30;
    case "other":
      return 12;
    case "control":
      return -68;
    case "mask":
      return -64;
    case "normal":
      return -72;
    default:
      return 10;
  }
}

function assemblyTextureHintGroups(name) {
  const lower = String(name || "").toLowerCase();
  if (!lower) {
    return [];
  }
  const groups = [];
  const normalized = lower.replace(/\.[a-z0-9]+$/g, "");
  if (lower.includes("eyelens")) {
    groups.push(["eye_lens", "lens", "eye_col0"]);
  } else if (lower.includes("eyeshadow")) {
    groups.push(["eye_highlight", "eye_col0", "face_col1"]);
  } else if (lower.includes("eye")) {
    groups.push(["eye_col0", "eye"]);
  }
  if (lower.includes("brow")) {
    groups.push(["face_col0", "brow"]);
  }
  if (lower.includes("face")) {
    groups.push(["face_col0", "face"]);
  }
  if (lower.includes("hair")) {
    groups.push(["hair_col0", "hair"]);
  }
  if (lower.includes("skin")) {
    groups.push(["skin_col0", "skin"]);
  }
  if (lower.includes("sotai") || lower.includes("body")) {
    groups.push(["skin_col0", "skin"]);
  }
  if (
    lower.includes("indoorshoes") ||
    lower.includes("loafer") ||
    lower.includes("shoe")
  ) {
    groups.push(["indoorshoes_col0", "loafer", "shoe"]);
  }
  if (lower.includes("cos") || lower.includes("skirt") || lower.includes("costume")) {
    groups.push(["cos_col0", "cos", "skirt", "costume"]);
  }
  if (
    lower.includes("night_sky") ||
    lower.includes("skybox") ||
    lower.includes("skydome") ||
    lower.includes("_sky") ||
    lower.includes(" sky")
  ) {
    groups.push(["sky_rhino", "night_sky", "sky", "skydome"]);
  }
  if (lower.includes("moon")) {
    groups.push(["moon_rhino", "moon"]);
  }
  if (lower.includes("ground") || lower.includes("floor")) {
    groups.push(["ground_rhino", "stage_floor_base", "ground", "floor"]);
  }
  if (lower.includes("lamp") || lower.includes("light")) {
    groups.push(["light_diffuse", "lamp", "light", "stage_stuffs"]);
  }
  if (lower.includes("sakura") || lower.includes("branch") || lower.includes("tree")) {
    groups.push(["sakura", "branch", "tree", "stage_stuffs"]);
  }
  if (
    /^\d{2}_/.test(normalized) ||
    normalized.includes("yagaistage") ||
    normalized.includes("ongakudou") ||
    normalized.includes("taikukan") ||
    normalized.includes("syokudo")
  ) {
    groups.push([
      "gakuen_tyuukei_01",
      "gakuen_tyuukei_02",
      "tyuukei_01",
      "tyuukei_02",
      "tyuukei",
    ]);
  }
  return groups;
}

function assemblyTextureDomain(value) {
  const text = String(value || "").toLowerCase();
  if (!text) {
    return "unknown";
  }
  if (text.includes("audience")) {
    return "audience";
  }
  if (text.includes("cloud")) {
    return "cloud";
  }
  if (text.includes("rain")) {
    return "rain";
  }
  if (
    text.includes("sakura") ||
    text.includes("branch") ||
    text.includes("tree") ||
    text.includes("leaf") ||
    text.includes("petal") ||
    text.includes("hanabira")
  ) {
    return "foliage";
  }
  if (
    text.includes("light") ||
    text.includes("lamp") ||
    text.includes("truss") ||
    text.includes("glow")
  ) {
    return "light";
  }
  if (
    text.includes("kousya") ||
    text.includes("window") ||
    text.includes("wall") ||
    text.includes("seimon") ||
    text.includes("fence") ||
    text.includes("curtain") ||
    text.includes("gaito")
  ) {
    return "architecture";
  }
  if (text.includes("shadow_wall")) {
    return "shadow";
  }
  if (text.includes("eyeshadow")) {
    return "eyeshadow";
  }
  if (
    text.includes("eyelens") ||
    (text.includes("eye") && text.includes("lens")) ||
    text.includes("_lens")
  ) {
    return "lens";
  }
  if (
    text.includes("eyeshadow") ||
    text.includes("eyehighlight") ||
    text.includes("eye_highlight") ||
    text.includes("eyehi") ||
    text.includes("eye_col") ||
    text.includes(" eye")
  ) {
    return "eye";
  }
  if (text.includes("brow") || text.includes("face")) {
    return "face";
  }
  if (
    text.includes("stage_stuffs") ||
    text.includes("stage_bamboo") ||
    text.includes("branchi_simple") ||
    text.includes("alpha_rhino")
  ) {
    return "foliage";
  }
  if (
    text.includes("night_sky") ||
    text.includes("skybox") ||
    text.includes("skydome") ||
    text.includes("_sky") ||
    text.includes(" sky")
  ) {
    return "sky";
  }
  if (text.includes("moon")) {
    return "moon";
  }
  if (text.includes("ground") || text.includes("stage_floor") || text.includes(" floor")) {
    return "ground";
  }
  if (
    text.includes("outfield") ||
    text.includes("road") ||
    text.includes("track") ||
    text.includes("field")
  ) {
    return "ground";
  }
  if (text.includes("main_sm")) {
    return "ground";
  }
  if (text.includes("shadow_wall") || text.includes("shadow")) {
    return "shadow";
  }
  if (text.includes("hair")) {
    return "hair";
  }
  if (text.includes("skin")) {
    return "skin";
  }
  if (text.includes("sotai") || text.includes("body")) {
    return "skin";
  }
  if (
    text.includes("indoorshoes") ||
    text.includes("loafer") ||
    text.includes("shoe")
  ) {
    return "shoe";
  }
  if (text.includes("cos") || text.includes("costume") || text.includes("skirt")) {
    return "costume";
  }
  return "unknown";
}

function assemblyTextureDomainCompatible(targetDomain, candidateDomain) {
  if (targetDomain === "unknown" || candidateDomain === "unknown") {
    return true;
  }
  if (targetDomain === candidateDomain) {
    return true;
  }
  if (
    (targetDomain === "eye" && candidateDomain === "lens") ||
    (targetDomain === "lens" && candidateDomain === "eye")
  ) {
    return true;
  }
  if (
    (targetDomain === "eyeshadow" && candidateDomain === "eye") ||
    (targetDomain === "eye" && candidateDomain === "eyeshadow")
  ) {
    return true;
  }
  if (targetDomain === "sky" || candidateDomain === "sky") {
    return targetDomain === candidateDomain;
  }
  if (targetDomain === "moon" || candidateDomain === "moon") {
    return targetDomain === candidateDomain;
  }
  if (targetDomain === "ground" || candidateDomain === "ground") {
    return targetDomain === candidateDomain;
  }
  if (targetDomain === "foliage" || candidateDomain === "foliage") {
    return targetDomain === candidateDomain;
  }
  if (targetDomain === "light" || candidateDomain === "light") {
    return targetDomain === candidateDomain;
  }
  if (targetDomain === "architecture" || candidateDomain === "architecture") {
    return targetDomain === candidateDomain;
  }
  if (targetDomain === "cloud" || candidateDomain === "cloud") {
    return targetDomain === candidateDomain;
  }
  if (targetDomain === "audience" || candidateDomain === "audience") {
    return targetDomain === candidateDomain;
  }
  if (targetDomain === "shadow" || candidateDomain === "shadow") {
    return targetDomain === candidateDomain;
  }
  if (targetDomain === "rain" || candidateDomain === "rain") {
    return targetDomain === candidateDomain;
  }
  return false;
}

function assemblyTextureSearchText(candidate) {
  const materials = Array.isArray(candidate?.materials) ? candidate.materials : [];
  return [candidate?.label || "", ...materials].join(" ").toLowerCase();
}

function assemblyTextureLooksNonColor(candidate, candidateTokens, role = "") {
  const text = assemblyTextureSearchText(candidate);
  if (role === "normal" || role === "mask" || role === "control") {
    return true;
  }
  const hasToken = (token) =>
    candidateTokens.has(token) || text.includes(token);
  return (
    hasToken("lightmap") ||
    hasToken("lm") ||
    hasToken("nm") ||
    hasToken("nml") ||
    hasToken("nrm") ||
    hasToken("normal") ||
    hasToken("metal") ||
    hasToken("metall") ||
    hasToken("metallic") ||
    hasToken("rough") ||
    hasToken("smooth") ||
    hasToken("spec") ||
    hasToken("emit") ||
    hasToken("emission") ||
    hasToken("dissolve") ||
    hasToken("rotation") ||
    hasToken("noise") ||
    hasToken("noiz") ||
    hasToken("dlm") ||
    hasToken("probemap") ||
    hasToken("cubemap")
  );
}

function analyzeAssemblyTextureMatch(candidate, entry, meshName = "") {
  const owners = Array.isArray(candidate?.owners) ? candidate.owners : [];
  const materials = Array.isArray(candidate?.materials) ? candidate.materials : [];
  const role = String(candidate?.role || "").trim().toLowerCase();
  const targetDomain = assemblyTextureDomain(
    `${entry?.name || ""} ${meshName || ""}`
  );
  const candidateDomain = assemblyTextureDomain(
    `${candidate?.label || ""} ${materials.join(" ")}`
  );
  const targetTokens = buildAssemblyTokenSet([
    entry?.rootLabel || "",
    entry?.label || "",
    entry?.name || "",
    meshName || "",
  ]);
  const candidateLabelTokens = buildAssemblyTokenSet(candidate?.label || "");
  const candidateMaterialTokens = buildAssemblyTokenSet(materials);
  const candidateTokens = new Set([
    ...candidateLabelTokens,
    ...candidateMaterialTokens,
  ]);
  const targetSpecificTokens = new Set(
    filterStageSpecificTokens([...targetTokens])
  );
  const candidateSpecificTokens = new Set(
    filterStageSpecificTokens([...candidateTokens])
  );
  const targetPhrases = buildAssemblyTokenPhrases([
    entry?.name || "",
    meshName || "",
  ]);
  const candidateSearchText = assemblyTextureSearchText(candidate);
  const ownerLabels = [entry?.label || "", entry?.rootLabel || ""]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  const ownerMatched = ownerLabels.some((label) => owners.includes(label));

  let overlapCount = 0;
  targetTokens.forEach((token) => {
    if (candidateLabelTokens.has(token) || candidateMaterialTokens.has(token)) {
      overlapCount += 1;
    }
  });

  let specificOverlapCount = 0;
  targetSpecificTokens.forEach((token) => {
    if (candidateSpecificTokens.has(token)) {
      specificOverlapCount += 1;
    }
  });

  let phraseMatchCount = 0;
  targetPhrases.forEach((phrase) => {
    const alt = phrase.replace(/_/g, " ");
    if (candidateSearchText.includes(phrase) || candidateSearchText.includes(alt)) {
      phraseMatchCount += 1;
    }
  });

  return {
    owners,
    ownerLabels,
    ownerMatched,
    role,
    targetDomain,
    candidateDomain,
    overlapCount,
    specificOverlapCount,
    phraseMatchCount,
    nonColorCandidate: assemblyTextureLooksNonColor(candidate, candidateTokens, role),
  };
}

function scoreAssemblyTextureCandidate(candidate, entry, meshName = "") {
  if (!candidate) {
    return -1e6;
  }
  const plainAvailable = candidate.plainAvailable !== false;
  const previewReady = candidate.previewReady !== false;
  if (!plainAvailable) {
    return -1e6;
  }
  if (!previewReady && candidate.previewExportable === false) {
    return -1e6;
  }
  const owners = Array.isArray(candidate.owners) ? candidate.owners : [];
  const materials = Array.isArray(candidate.materials) ? candidate.materials : [];
  const materialCount = materials.length;
  const role = String(candidate.role || "").trim().toLowerCase();
  const targetDomain = assemblyTextureDomain(
    `${entry?.name || ""} ${meshName || ""}`
  );
  const candidateDomain = assemblyTextureDomain(
    `${candidate?.label || ""} ${materials.join(" ")}`
  );
  const targetTokens = buildAssemblyTokenSet([
    entry?.rootLabel || "",
    entry?.label || "",
    entry?.name || "",
    meshName || "",
  ]);
  const candidateLabelTokens = buildAssemblyTokenSet(candidate.label || "");
  const candidateMaterialTokens = buildAssemblyTokenSet(materials);
  const candidateTokens = new Set([
    ...candidateLabelTokens,
    ...candidateMaterialTokens,
  ]);
  const candidateSearchText = assemblyTextureSearchText(candidate);
  const targetSpecificTokens = filterStageSpecificTokens([...targetTokens]);
  const candidateSpecificTokens = filterStageSpecificTokens([...candidateTokens]);
  const candidateSpecificTokenSet = new Set(candidateSpecificTokens);
  const targetPhrases = buildAssemblyTokenPhrases([
    entry?.name || "",
    meshName || "",
  ]);
  const nonColorCandidate = assemblyTextureLooksNonColor(
    candidate,
    candidateTokens,
    role
  );

  let score = assemblyTextureRoleWeight(role);
  const stageAssembly = isStageAssemblyRoot(entry?.rootLabel || entry?.label);
  const stageAggregateSelf = isStageAggregateSelfComponent(
    entry?.rootLabel || entry?.label,
    entry
  );
  if (stageAssembly && stageAggregateSelf && targetDomain === "unknown") {
    return -1e6;
  }
  const ownerLabels = [entry?.label || "", entry?.rootLabel || ""]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  const ownerMatched = ownerLabels.some((label) => owners.includes(label));
  if (ownerMatched) {
    score += 52;
  }

  const ownerIdentity =
    assemblyIdentityToken(entry?.label || "") ||
    assemblyIdentityToken(entry?.rootLabel || "");
  const candidateIdentity = assemblyIdentityToken(candidate?.label || "");
  if (ownerIdentity && candidateIdentity) {
    if (ownerIdentity === candidateIdentity) {
      score += 64;
    } else if (
      assemblyIdentityFamily(ownerIdentity) &&
      assemblyIdentityFamily(ownerIdentity) ===
        assemblyIdentityFamily(candidateIdentity)
    ) {
      score += 42;
    } else if (
      assemblyIdentityRoot(ownerIdentity) &&
      assemblyIdentityRoot(ownerIdentity) ===
        assemblyIdentityRoot(candidateIdentity)
    ) {
      score += 24;
    } else {
      score -= 120;
    }
  }

  let overlapCount = 0;
  targetTokens.forEach((token) => {
    if (candidateLabelTokens.has(token)) {
      overlapCount += 1;
      score += token.length >= 4 ? 12 : 7;
      return;
    }
    if (candidateMaterialTokens.has(token)) {
      overlapCount += 1;
      score += token.length >= 4 ? 5 : 3;
    }
  });
  if (!ownerMatched && overlapCount === 0) {
    score -= 40;
  }
  let specificOverlapCount = 0;
  targetSpecificTokens.forEach((token) => {
    if (candidateSpecificTokenSet.has(token)) {
      specificOverlapCount += 1;
    }
  });
  if (specificOverlapCount > 0) {
    score += Math.min(4, specificOverlapCount) * 11;
  }
  let phraseMatchCount = 0;
  targetPhrases.forEach((phrase) => {
    const alt = phrase.replace(/_/g, " ");
    if (candidateSearchText.includes(phrase) || candidateSearchText.includes(alt)) {
      phraseMatchCount += 1;
    }
  });
  if (phraseMatchCount > 0) {
    score += Math.min(3, phraseMatchCount) * 32;
  }
  if (stageAssembly) {
    const candidateLabel = String(candidate?.label || "").toLowerCase();
    const looksBaseColor =
      candidateLabel.includes("_bc") ||
      candidateLabel.includes("basecolor") ||
      candidateLabel.includes("diffuse");
    const looksDetailMap =
      candidateLabel.includes("_dlm") ||
      candidateLabel.includes("_lm") ||
      candidateLabel.includes("_nml") ||
      candidateLabel.includes("_nrm") ||
      candidateLabel.includes("_nm") ||
      candidateLabel.includes("probemap") ||
      candidateLabel.includes("metall");
    if (looksBaseColor) {
      score += 26;
    }
    if (looksDetailMap) {
      score -= 112;
    }
    if (materialCount >= 8 && specificOverlapCount === 0 && phraseMatchCount === 0) {
      score -= 96;
    }
    if (targetDomain === "unknown" && materialCount >= 10 && overlapCount < 2) {
      score -= 88;
    }
    if (
      targetDomain === "unknown" &&
      overlapCount === 0 &&
      specificOverlapCount === 0 &&
      phraseMatchCount === 0
    ) {
      score -= 140;
    }
  }

  if (targetDomain !== "unknown" && candidateDomain !== "unknown") {
    if (assemblyTextureDomainCompatible(targetDomain, candidateDomain)) {
      if (targetDomain === candidateDomain) {
        score += 44;
      } else {
        score += 12;
      }
    } else {
      score -= 180;
    }
  }

  if (!previewReady) {
    score -= stageAssembly ? 56 : 18;
  } else {
    score += 8;
  }

  if (nonColorCandidate) {
    score -= stageAssembly ? 72 : 36;
    if (targetDomain === "sky" || targetDomain === "moon") {
      score -= 44;
    }
  }

  // Stage assemblies often include many generic meshes (e.g. "Lit" material).
  // For unknown domains, reduce strong albedo/lens/highlight bias to avoid
  // mapping one candidate onto most scene meshes.
  if (stageAssembly && targetDomain === "unknown") {
    if (role === "albedo" || role === "highlight" || role === "lens") {
      score -= 36;
    }
  }

  const meshText = String(meshName || entry?.name || "").toLowerCase();
  const stageNumberedBuildingMesh =
    stageAssembly &&
    /^\d{2}_/.test(meshText) &&
    !meshText.includes("ground") &&
    !meshText.includes("snow");
  if (stageNumberedBuildingMesh) {
    if (candidateSearchText.includes("tyuukei")) {
      score += 118;
    }
    if (
      candidateSearchText.includes("stage_bc") ||
      candidateSearchText.includes("stage_stuffs")
    ) {
      score -= 138;
    }
    if (candidateSearchText.includes("ground")) {
      score -= 126;
    }
  }
  const wantsEyeShadow =
    meshText.includes("eyeshadow") || targetDomain === "eyeshadow";
  if (wantsEyeShadow) {
    if (
      role === "highlight" ||
      candidateTokens.has("highlight") ||
      candidateTokens.has("eyesh")
    ) {
      score += 132;
    } else if (role === "albedo") {
      score -= 118;
    } else if (role === "lens") {
      score -= 58;
    }
  } else if (targetDomain === "eye") {
    if (role === "albedo") {
      score += 18;
    } else if (role === "highlight") {
      score -= 26;
    }
  } else if (targetDomain === "lens") {
    if (role === "lens") {
      score += 86;
    } else if (role === "albedo") {
      score -= 74;
    }
  }

  const has = (token) => targetTokens.has(token);
  const cHas = (token) => candidateTokens.has(token);
  const hasAny = (...tokens) => tokens.some((token) => targetTokens.has(token));
  const cHasAny = (...tokens) => tokens.some((token) => candidateTokens.has(token));
  const isFoliageMesh = hasAny("sakura", "branch", "tree", "leaf", "petal", "hanabira");
  if (has("hair") && cHas("hair")) score += 18;
  if (has("skin") && cHas("skin")) score += 18;
  if ((has("cos") || has("costume")) && (cHas("cos") || cHas("costume"))) score += 17;
  if (has("shoe") && (cHas("shoe") || cHas("loafer") || cHas("indoorshoes"))) score += 18;
  if (has("brow") && cHas("brow")) score += 18;
  if (has("eye") && cHas("eye")) score += 18;
  if (has("face") && cHas("face")) score += 18;
  if (has("lens") && (role === "lens" || cHas("lens"))) score += 28;
  if (has("highlight") && (role === "highlight" || cHas("highlight"))) score += 21;
  if (hasAny("sky", "night") && cHasAny("sky", "skydome")) score += 64;
  if (has("moon") && cHas("moon")) score += 64;
  if (hasAny("ground", "floor") && cHasAny("ground", "floor")) score += 34;
  if (hasAny("lamp", "lamps", "light") && cHasAny("lamp", "light")) score += 28;
  if (hasAny("sakura", "branch", "tree") && cHasAny("sakura", "branch", "tree")) score += 24;
  if (isFoliageMesh && cHasAny("stage", "stuffs", "alpha", "branchi", "sakura")) score += 34;
  if (isFoliageMesh && cHasAny("lm", "dlm", "lightmap", "probemap")) score -= 140;
  if (!hasAny("ground", "floor") && cHasAny("ground", "floor", "main_sm")) score -= 120;
  if (!has("moon") && cHas("moon")) score -= 120;
  if (has("sky") && cHas("moon")) score -= 44;
  if (has("moon") && cHas("sky")) score -= 44;

  return score;
}

function selectAssemblyTextureCandidate(candidates, entry, meshName = "") {
  if (!Array.isArray(candidates) || !candidates.length || !entry) {
    return null;
  }
  const available = candidates.filter((candidate) => candidate?.plainAvailable !== false);
  if (!available.length) {
    return null;
  }
  const ownerLabels = [entry?.label || "", entry?.rootLabel || ""]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  const ownerLabel = ownerLabels[0] || "";
  const strictIdentityMode = String(entry?.rootLabel || "")
    .toLowerCase()
    .startsWith("3d_item_");
  const ownerMatchedPool = available.filter((candidate) => {
    const owners = Array.isArray(candidate?.owners) ? candidate.owners : [];
    return ownerLabels.some((label) => owners.includes(label));
  });
  let pool = ownerMatchedPool.length ? ownerMatchedPool : available;
  const stageAssembly = isStageAssemblyRoot(entry?.rootLabel || entry?.label);
  const stageAggregateSelf = isStageAggregateSelfComponent(
    entry?.rootLabel || entry?.label,
    entry
  );
  const targetDomain = assemblyTextureDomain(`${entry?.name || ""} ${meshName || ""}`);
  if (stageAssembly && stageAggregateSelf && targetDomain === "unknown") {
    return null;
  }
  if (targetDomain !== "unknown") {
    const domainMatched = pool.filter((candidate) => {
      const materials = Array.isArray(candidate?.materials) ? candidate.materials : [];
      const candidateDomain = assemblyTextureDomain(
        `${candidate?.label || ""} ${materials.join(" ")}`
      );
      return assemblyTextureDomainCompatible(targetDomain, candidateDomain);
    });
    if (domainMatched.length) {
      pool = domainMatched;
    }
  }
  if (stageAssembly && targetDomain !== "unknown") {
    const colorPool = pool.filter((candidate) => {
      const materials = Array.isArray(candidate?.materials) ? candidate.materials : [];
      const role = String(candidate?.role || "").trim().toLowerCase();
      const candidateTokens = new Set([
        ...buildAssemblyTokenSet(candidate?.label || ""),
        ...buildAssemblyTokenSet(materials),
      ]);
      return !assemblyTextureLooksNonColor(candidate, candidateTokens, role);
    });
    if (colorPool.length) {
      pool = colorPool;
    }
  }
  if (!stageAssembly) {
    const readyPool = pool.filter((candidate) => candidate?.previewReady !== false);
    if (readyPool.length) {
      pool = readyPool;
    }
  } else if (targetDomain === "sky" || targetDomain === "moon") {
    const readyPool = pool.filter((candidate) => candidate?.previewReady !== false);
    if (readyPool.length) {
      pool = readyPool;
    }
  }
  const preferReadyForDomain =
    targetDomain === "eye" || targetDomain === "lens";
  if (preferReadyForDomain) {
    const readyPool = pool.filter((candidate) => candidate?.previewReady !== false);
    if (readyPool.length) {
      pool = readyPool;
    }
  }
  if (stageAssembly && targetDomain === "unknown") {
    const targetTokens = buildAssemblyTokenSet([
      entry?.rootLabel || "",
      entry?.label || "",
      entry?.name || "",
      meshName || "",
    ]);
    const targetSpecificTokens = new Set(
      filterStageSpecificTokens([...targetTokens])
    );
    const targetPhrases = buildAssemblyTokenPhrases([
      entry?.name || "",
      meshName || "",
    ]);
    const overlapPool = pool.filter((candidate) => {
      const materials = Array.isArray(candidate?.materials) ? candidate.materials : [];
      const candidateTokens = new Set(buildAssemblyTokenSet([
        candidate?.label || "",
        ...materials,
      ]));
      const candidateSpecificTokens = new Set(
        filterStageSpecificTokens([...candidateTokens])
      );
      let specificOverlap = 0;
      for (const token of targetTokens) {
        if (candidateTokens.has(token)) {
          return true;
        }
      }
      for (const token of targetSpecificTokens) {
        if (candidateSpecificTokens.has(token)) {
          specificOverlap += 1;
        }
      }
      if (specificOverlap >= 2) {
        return true;
      }
      const searchText = assemblyTextureSearchText(candidate);
      for (const phrase of targetPhrases) {
        const alt = phrase.replace(/_/g, " ");
        if (searchText.includes(phrase) || searchText.includes(alt)) {
          return true;
        }
      }
      return false;
    });
    if (overlapPool.length) {
      pool = overlapPool;
    }
  }
  const ownerIdentity =
    assemblyIdentityToken(ownerLabel) ||
    assemblyIdentityToken(entry?.rootLabel || "");
  if (ownerIdentity) {
    const exactMatched = pool.filter(
      (candidate) =>
        assemblyCandidateIdentityState(candidate, ownerIdentity) === "exact"
    );
    if (exactMatched.length) {
      pool = exactMatched;
    } else {
      const familyMatched = pool.filter(
        (candidate) =>
          assemblyCandidateIdentityState(candidate, ownerIdentity) === "family"
      );
      if (familyMatched.length) {
        pool = familyMatched;
      } else {
        const relatedMatched = pool.filter(
          (candidate) =>
            assemblyCandidateIdentityState(candidate, ownerIdentity) === "related"
        );
        if (relatedMatched.length) {
          pool = relatedMatched;
        } else {
          const nonMismatch = pool.filter((candidate) => {
            const state = assemblyCandidateIdentityState(candidate, ownerIdentity);
            if (strictIdentityMode) {
              return false;
            }
            return state !== "mismatch";
          });
          if (nonMismatch.length) {
            pool = nonMismatch;
          } else if (strictIdentityMode) {
            pool = [];
          }
        }
      }
    }
  }
  const hints = assemblyTextureHintGroups(`${entry?.name || ""} ${meshName || ""}`);

  const chooseBest = (list) => {
    let best = null;
    let bestScore = -1e6;
    let secondScore = -1e6;
    for (const candidate of list) {
      const score = scoreAssemblyTextureCandidate(candidate, entry, meshName);
      if (score > bestScore) {
        secondScore = bestScore;
        bestScore = score;
        best = candidate;
      } else if (score > secondScore) {
        secondScore = score;
      }
    }
    if (!best) {
      return null;
    }
    const matchInfo = analyzeAssemblyTextureMatch(best, entry, meshName);
    const ownerMatched = Boolean(matchInfo.ownerMatched);
    const minScore = strictIdentityMode
      ? 64
      : stageAssembly && targetDomain === "unknown"
      ? 42
      : 20;
    if (bestScore < minScore && !ownerMatched) {
      return null;
    }
    const margin = bestScore - secondScore;
    if (stageAssembly) {
      const unknownDomain = targetDomain === "unknown";
      if (unknownDomain) {
        const hasStrongEvidence =
          ownerMatched ||
          matchInfo.phraseMatchCount >= 1 ||
          matchInfo.specificOverlapCount >= 2 ||
          matchInfo.overlapCount >= 2;
        if (!hasStrongEvidence) {
          return null;
        }
        if (bestScore < (ownerMatched ? 56 : 74)) {
          return null;
        }
        if (!ownerMatched && secondScore > -1e5 && margin < 16) {
          return null;
        }
      } else {
        if (matchInfo.nonColorCandidate && targetDomain !== "shadow") {
          return null;
        }
        if (
          !ownerMatched &&
          matchInfo.specificOverlapCount === 0 &&
          matchInfo.phraseMatchCount === 0 &&
          bestScore < 36
        ) {
          return null;
        }
        if (
          !ownerMatched &&
          secondScore > -1e5 &&
          margin < 10 &&
          matchInfo.specificOverlapCount < 2 &&
          matchInfo.phraseMatchCount === 0
        ) {
          return null;
        }
      }
    }
    return {
      candidate: best,
      score: bestScore,
      info: matchInfo,
    };
  };

  for (const group of hints) {
    const matched = pool.filter((candidate) => {
      const text = assemblyTextureSearchText(candidate);
      return group.some((token) => text.includes(String(token || "").toLowerCase()));
    });
    if (matched.length) {
      const bestHint = chooseBest(matched);
      if (bestHint) {
        return bestHint;
      }
    }
  }

  const best = chooseBest(pool);
  if (!best) {
    return null;
  }
  return best;
}

function buildAssemblyTextureManualOptions(candidates, entry) {
  if (!Array.isArray(candidates) || !candidates.length || !entry) {
    return [];
  }
  const available = candidates.filter((candidate) => candidate?.plainAvailable !== false);
  if (!available.length) {
    return [];
  }
  const targetDomain = assemblyTextureDomain(`${entry?.name || ""}`);
  const scored = available
    .map((candidate) => {
      const score = scoreAssemblyTextureCandidate(candidate, entry, "");
      const info = analyzeAssemblyTextureMatch(candidate, entry, "");
      return { candidate, score, info };
    })
    .filter((item) => {
      return Boolean(item?.candidate?.label);
    })
    .sort((left, right) => {
      const leftOwner = left.info.ownerMatched ? 1 : 0;
      const rightOwner = right.info.ownerMatched ? 1 : 0;
      if (leftOwner !== rightOwner) {
        return rightOwner - leftOwner;
      }
      const domainRank = (item) => {
        if (!targetDomain || targetDomain === "unknown") {
          return 0;
        }
        if (item.info.candidateDomain === targetDomain) {
          return 2;
        }
        if (assemblyTextureDomainCompatible(targetDomain, item.info.candidateDomain)) {
          return 1;
        }
        return 0;
      };
      const leftDomainRank = domainRank(left);
      const rightDomainRank = domainRank(right);
      if (leftDomainRank !== rightDomainRank) {
        return rightDomainRank - leftDomainRank;
      }
      const leftEvidence =
        Number(left.info.phraseMatchCount || 0) * 3 +
        Number(left.info.specificOverlapCount || 0) * 2 +
        Number(left.info.overlapCount || 0);
      const rightEvidence =
        Number(right.info.phraseMatchCount || 0) * 3 +
        Number(right.info.specificOverlapCount || 0) * 2 +
        Number(right.info.overlapCount || 0);
      if (leftEvidence !== rightEvidence) {
        return rightEvidence - leftEvidence;
      }
      if (left.score !== right.score) {
        return right.score - left.score;
      }
      return String(left.candidate.label || "").localeCompare(
        String(right.candidate.label || "")
      );
    });

  const seen = new Set();
  const options = [];
  for (const item of scored) {
    const label = String(item?.candidate?.label || "").trim();
    if (!label || seen.has(label)) {
      continue;
    }
    seen.add(label);
    options.push(item.candidate);
  }
  return options;
}

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

function clampNumber(value, min, max, fallback = min) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return fallback;
  }
  if (num < min) {
    return min;
  }
  if (num > max) {
    return max;
  }
  return num;
}

function readLocalStorageJson(key, fallback) {
  if (!key || typeof localStorage === "undefined") {
    return fallback;
  }
  try {
    const raw = localStorage.getItem(key);
    if (!raw) {
      return fallback;
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return fallback;
    }
    return parsed;
  } catch (err) {
    return fallback;
  }
}

function writeLocalStorageJson(key, payload) {
  if (!key || typeof localStorage === "undefined") {
    return false;
  }
  try {
    localStorage.setItem(key, JSON.stringify(payload || {}));
    return true;
  } catch (err) {
    return false;
  }
}

function normalizePrefabAssemblyRootKey(rootLabel) {
  return String(rootLabel || "").trim().toLowerCase();
}

function buildPrefabAssemblyTextureOverrideKey(component = {}, rootLabel = "") {
  const owner = String(component?.label || rootLabel || "")
    .trim()
    .toLowerCase();
  const itemId = String(component?.itemId || "")
    .trim()
    .toLowerCase();
  const name = String(component?.name || "")
    .trim()
    .toLowerCase();
  const type = String(component?.type || "")
    .trim()
    .toLowerCase();
  const source = String(component?.source || "")
    .trim()
    .toLowerCase();
  return [owner, itemId, name, type, source].join("|");
}

function loadPrefabAssemblyTextureOverrides(rootLabel) {
  const rootKey = normalizePrefabAssemblyRootKey(rootLabel);
  if (!rootKey) {
    return {};
  }
  const all = readLocalStorageJson(
    prefabAssemblyTextureOverrideStorageKey,
    {}
  );
  const value = all?.[rootKey];
  if (!value || typeof value !== "object") {
    return {};
  }
  return value;
}

function savePrefabAssemblyTextureOverrides(rootLabel, mapping) {
  const rootKey = normalizePrefabAssemblyRootKey(rootLabel);
  if (!rootKey) {
    return false;
  }
  const all = readLocalStorageJson(
    prefabAssemblyTextureOverrideStorageKey,
    {}
  );
  if (!mapping || typeof mapping !== "object" || !Object.keys(mapping).length) {
    delete all[rootKey];
    return writeLocalStorageJson(prefabAssemblyTextureOverrideStorageKey, all);
  }
  all[rootKey] = mapping;
  return writeLocalStorageJson(prefabAssemblyTextureOverrideStorageKey, all);
}

function clearPrefabAssemblyTextureOverrides(rootLabel) {
  return savePrefabAssemblyTextureOverrides(rootLabel, {});
}

function normalizePrefabAssemblyLayoutPrefs(input) {
  const candidate = input && typeof input === "object" ? input : {};
  const listWidth = Math.round(
    clampNumber(
      candidate.listWidth,
      260,
      840,
      prefabAssemblyLayoutDefaults.listWidth
    )
  );
  const listHeight = Math.round(
    clampNumber(
      candidate.listHeight,
      180,
      920,
      prefabAssemblyLayoutDefaults.listHeight
    )
  );
  const listColumnsValue = String(candidate.listColumns || "auto").trim().toLowerCase();
  const listColumns =
    listColumnsValue === "1" ||
    listColumnsValue === "2" ||
    listColumnsValue === "3"
      ? listColumnsValue
      : "auto";
  return {
    listWidth,
    listHeight,
    listColumns,
  };
}

function loadPrefabAssemblyLayoutPrefs() {
  return normalizePrefabAssemblyLayoutPrefs(
    readLocalStorageJson(prefabAssemblyLayoutPrefsStorageKey, {})
  );
}

function savePrefabAssemblyLayoutPrefs(prefs) {
  return writeLocalStorageJson(
    prefabAssemblyLayoutPrefsStorageKey,
    normalizePrefabAssemblyLayoutPrefs(prefs)
  );
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

function sanitizeExportFileName(name) {
  const text = String(name || "").trim();
  if (!text) {
    return "assembly";
  }
  return text.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^_+|_+$/g, "") || "assembly";
}

function triggerBlobDownload(blob, fileName) {
  if (!blob) {
    return;
  }
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName || "assembly.glb";
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1200);
}

function rememberAssemblyExportInMemory(key, value) {
  if (!key || !value || !value.blob) {
    return;
  }
  assemblyExportMemoryCache.set(key, {
    blob: value.blob,
    filename: value.filename || "",
    ts: Date.now(),
  });
  if (assemblyExportMemoryCache.size <= 8) {
    return;
  }
  const oldest = [...assemblyExportMemoryCache.entries()].sort(
    (left, right) => Number(left[1]?.ts || 0) - Number(right[1]?.ts || 0)
  )[0];
  if (oldest && oldest[0]) {
    assemblyExportMemoryCache.delete(oldest[0]);
  }
}

async function hashText(text) {
  const input = String(text || "");
  const encoder = new TextEncoder();
  const bytes = encoder.encode(input);
  if (window.crypto && window.crypto.subtle) {
    const digest = await window.crypto.subtle.digest("SHA-1", bytes);
    return Array.from(new Uint8Array(digest))
      .map((part) => part.toString(16).padStart(2, "0"))
      .join("");
  }
  let hash = 2166136261;
  for (let index = 0; index < bytes.length; index += 1) {
    hash ^= bytes[index];
    hash +=
      (hash << 1) +
      (hash << 4) +
      (hash << 7) +
      (hash << 8) +
      (hash << 24);
  }
  return (hash >>> 0).toString(16);
}

async function readAssemblyExportPersistentCache(key) {
  if (!key || typeof caches === "undefined") {
    return null;
  }
  try {
    const cache = await caches.open(assemblyExportPersistentCacheName);
    const response = await cache.match(`/assembly-export/${encodeURIComponent(key)}`);
    if (!response) {
      return null;
    }
    return {
      blob: await response.blob(),
      filename: response.headers.get("x-file-name") || "",
    };
  } catch (err) {
    return null;
  }
}

async function writeAssemblyExportPersistentCache(key, blob, fileName) {
  if (!key || !blob || typeof caches === "undefined") {
    return;
  }
  try {
    const cache = await caches.open(assemblyExportPersistentCacheName);
    await cache.put(
      `/assembly-export/${encodeURIComponent(key)}`,
      new Response(blob, {
        headers: {
          "content-type": "model/gltf-binary",
          "x-file-name": fileName || "",
        },
      })
    );
  } catch (err) {
    // Ignore cache write failures; export should still succeed.
  }
}

function normalizedRigName(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function findRigBoneKey(name) {
  const normalized = normalizedRigName(name);
  if (!normalized) {
    return "";
  }
  const keys = Object.keys(rigBoneAliasMap);
  for (const key of keys) {
    const aliases = rigBoneAliasMap[key] || [];
    if (aliases.some((alias) => normalized.includes(alias))) {
      return key;
    }
  }
  return "";
}

function normalizeAssemblyError(err) {
  if (!err) {
    return "";
  }
  if (typeof err === "string") {
    return err.trim();
  }
  if (typeof err?.message === "string") {
    return err.message.trim();
  }
  return String(err).trim();
}

function threeModuleProviders(version) {
  const v = String(version || "").trim();
  return [
    {
      name: "jsdelivr-esm",
      THREE: `https://cdn.jsdelivr.net/npm/three@${v}/build/three.module.js/+esm`,
      OrbitControls:
        `https://cdn.jsdelivr.net/npm/three@${v}/examples/jsm/controls/OrbitControls.js/+esm`,
      GLTFLoader:
        `https://cdn.jsdelivr.net/npm/three@${v}/examples/jsm/loaders/GLTFLoader.js/+esm`,
      GLTFExporter:
        `https://cdn.jsdelivr.net/npm/three@${v}/examples/jsm/exporters/GLTFExporter.js/+esm`,
    },
    {
      name: "unpkg-module",
      THREE: `https://unpkg.com/three@${v}/build/three.module.js?module`,
      OrbitControls:
        `https://unpkg.com/three@${v}/examples/jsm/controls/OrbitControls.js?module`,
      GLTFLoader:
        `https://unpkg.com/three@${v}/examples/jsm/loaders/GLTFLoader.js?module`,
      GLTFExporter:
        `https://unpkg.com/three@${v}/examples/jsm/exporters/GLTFExporter.js?module`,
    },
    {
      name: "esm.sh",
      THREE: `https://esm.sh/three@${v}`,
      OrbitControls:
        `https://esm.sh/three@${v}/examples/jsm/controls/OrbitControls.js`,
      GLTFLoader:
        `https://esm.sh/three@${v}/examples/jsm/loaders/GLTFLoader.js`,
      GLTFExporter:
        `https://esm.sh/three@${v}/examples/jsm/exporters/GLTFExporter.js`,
    },
  ];
}

async function loadThreeModulesFromProvider(provider) {
  const [threeMod, controlsMod, loaderMod, exporterMod] = await Promise.all([
    import(provider.THREE),
    import(provider.OrbitControls),
    import(provider.GLTFLoader),
    import(provider.GLTFExporter),
  ]);
  return {
    THREE: threeMod,
    OrbitControls: controlsMod.OrbitControls,
    GLTFLoader: loaderMod.GLTFLoader,
    GLTFExporter: exporterMod.GLTFExporter,
  };
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

async function pollPreviewExportTaskSnapshot(taskId, onUpdate) {
  const started = Date.now();
  while (true) {
    const payload = await App.apiGet(
      `/api/entry/preview/export/status?id=${encodeURIComponent(taskId)}`
    );
    const task = payload.task || payload || {};
    const status = String(task.status || "running").toLowerCase();
    if (typeof onUpdate === "function") {
      onUpdate(task);
    }
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

async function inferPrefabPendingDependencies(dependencies) {
  const labels = Array.from(
    new Set(
      (Array.isArray(dependencies) ? dependencies : [])
        .map((item) => String(item || "").trim())
        .filter(Boolean)
    )
  );
  if (!labels.length) {
    return [];
  }

  const pending = [];
  for (const label of labels) {
    const lowerLabel = label.toLowerCase();
    try {
      const data = await App.apiGet(`/api/entry?label=${encodeURIComponent(label)}`);
      const preview = data?.preview || {};
      const kind = String(data?.type || "").toLowerCase();
      const isCandidate =
        kind === "fbx" ||
        kind === "prefab" ||
        kind === "unity" ||
        lowerLabel.endsWith(".fbx") ||
        lowerLabel.endsWith(".prefab") ||
        lowerLabel.endsWith(".unity");
      if (!isCandidate) {
        continue;
      }
      if (preview.exportable && !preview.available) {
        pending.push({
          label,
          type: data?.type || "",
          resourceType: Number(data?.resourceType || 0),
          size: Number(data?.size || 0),
        });
      }
    } catch (err) {
      // Ignore dependency lookup errors and continue probing other labels.
    }
  }
  return pending;
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

function assemblyExportProgressText(phase) {
  switch (String(phase || "").trim().toLowerCase()) {
    case "prepare":
      return I18n.t("view.prefabAssemblyExportPrepare");
    case "collect":
      return I18n.t("view.prefabAssemblyExportCollect");
    case "export":
      return I18n.t("view.prefabAssemblyExportEncode");
    case "cache":
      return I18n.t("view.prefabAssemblyExportCache");
    case "cached":
      return I18n.t("view.prefabAssemblyExportCached");
    case "done":
      return I18n.t("view.prefabAssemblyExportDone");
    default:
      return I18n.t("view.prefabAssemblyExportIdle");
  }
}

function collectAssemblyRigInfo(root) {
  const skeletons = [];
  const seen = new Set();
  root.traverse((obj) => {
    if (!obj || !obj.isSkinnedMesh || !obj.skeleton || !Array.isArray(obj.skeleton.bones)) {
      return;
    }
    const id = String(obj.skeleton.uuid || "");
    if (!id || seen.has(id)) {
      return;
    }
    seen.add(id);
    skeletons.push(obj.skeleton);
  });

  const profiles = skeletons
    .map((skeleton) => {
      const mapped = {};
      (skeleton.bones || []).forEach((bone) => {
        const key = findRigBoneKey(bone?.name || "");
        if (key && !mapped[key]) {
          mapped[key] = bone;
        }
      });
      return {
        skeleton,
        bones: skeleton.bones || [],
        mapped,
        mappedCount: Object.keys(mapped).length,
      };
    })
    .sort((left, right) => {
      if (left.mappedCount !== right.mappedCount) {
        return right.mappedCount - left.mappedCount;
      }
      return right.bones.length - left.bones.length;
    });

  const primary = profiles[0] || null;
  const totalBones = profiles.reduce(
    (sum, profile) => sum + Number(profile.bones.length || 0),
    0
  );
  const mappedJointCount = primary ? Object.keys(primary.mapped).length : 0;
  return {
    available: profiles.length > 0,
    profiles,
    skeletonCount: profiles.length,
    totalBones,
    mappedJointCount,
    humanoid: mappedJointCount >= 8,
  };
}

async function loadThreeModules() {
  if (!threeModulesPromise) {
    const version = "0.164.1";
    threeModulesPromise = (async () => {
      const providers = threeModuleProviders(version);
      const errors = [];
      for (const provider of providers) {
        try {
          return await loadThreeModulesFromProvider(provider);
        } catch (err) {
          errors.push(`${provider.name}: ${normalizeAssemblyError(err)}`);
        }
      }
      throw new Error(errors.join(" | "));
    })();
  }
  return threeModulesPromise;
}

function mountPrefabAssemblyViewer(viewport, statusEl, entries, rootLabel, hooks = {}) {
  let disposed = false;
  let rafId = 0;
  let resizeOff = () => {};
  let cleanupRenderer = () => {};
  let showAutoDuplicates = false;
  let autoDuplicateCount = 0;
  const sizeDedupEnabled = String(rootLabel || "")
    .toLowerCase()
    .startsWith("3d_item_");
  const textureCandidates = Array.isArray(hooks?.textureCandidates)
    ? hooks.textureCandidates.filter((item) => item && item.label)
    : [];

  loadThreeModules()
    .then(({ THREE, OrbitControls, GLTFLoader, GLTFExporter }) => {
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
      if ("toneMapping" in renderer && "ACESFilmicToneMapping" in THREE) {
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
      }
      if ("toneMappingExposure" in renderer) {
        renderer.toneMappingExposure = 1.12;
      }
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      viewport.innerHTML = "";
      viewport.appendChild(renderer.domElement);
      renderer.domElement.style.width = "100%";
      renderer.domElement.style.height = "100%";
      renderer.domElement.style.display = "block";
      if (typeof renderer.setClearColor === "function") {
        renderer.setClearColor(0xeef2f8, 1);
      }

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0xeef2f8);
      const camera = new THREE.PerspectiveCamera(44, 1, 0.01, 5000);
      camera.position.set(1.2, 1.1, 2.4);

      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;

      const hemi = new THREE.HemisphereLight(0xffffff, 0xb6c5d7, 1.24);
      scene.add(hemi);
      const ambient = new THREE.AmbientLight(0xffffff, 0.56);
      scene.add(ambient);
      const keyLight = new THREE.DirectionalLight(0xffffff, 1.24);
      keyLight.position.set(3, 6, 4);
      scene.add(keyLight);
      const fillLight = new THREE.DirectionalLight(0x9bb6d4, 0.72);
      fillLight.position.set(-4, 2.5, -3);
      scene.add(fillLight);
      const rimLight = new THREE.DirectionalLight(0xffffff, 0.34);
      rimLight.position.set(0.5, 2.8, -5);
      scene.add(rimLight);

      const root = new THREE.Group();
      scene.add(root);

      const grid = new THREE.GridHelper(8, 16, 0x5f7488, 0x8da2b4);
      if (grid.material) {
        grid.material.transparent = true;
        grid.material.opacity = 0.22;
      }
      grid.position.y = -0.001;
      scene.add(grid);

      const textureLoader = new THREE.TextureLoader();
      const textureCache = new Map();
      const texturePrepareCache = new Map();
      let missingTexture = null;
      let latestRigInfo = {
        available: false,
        profiles: [],
        skeletonCount: 0,
        totalBones: 0,
        mappedJointCount: 0,
        humanoid: false,
      };

      const loadTextureFromUrl = (url) =>
        new Promise((resolve) => {
          textureLoader.load(
            url,
            (texture) => {
              if (!texture) {
                resolve(null);
                return;
              }
              texture.flipY = false;
              if ("colorSpace" in texture && "SRGBColorSpace" in THREE) {
                texture.colorSpace = THREE.SRGBColorSpace;
              }
              if ("RepeatWrapping" in THREE) {
                texture.wrapS = THREE.RepeatWrapping;
                texture.wrapT = THREE.RepeatWrapping;
              }
              if ("LinearFilter" in THREE) {
                texture.magFilter = THREE.LinearFilter;
              }
              if ("LinearMipmapLinearFilter" in THREE) {
                texture.minFilter = THREE.LinearMipmapLinearFilter;
              }
              if (renderer?.capabilities && typeof renderer.capabilities.getMaxAnisotropy === "function") {
                texture.anisotropy = Math.min(
                  8,
                  Math.max(1, renderer.capabilities.getMaxAnisotropy())
                );
              }
              texture.needsUpdate = true;
              resolve(texture);
            },
            undefined,
            () => resolve(null)
          );
        });

      const ensureAssemblyTexturePreview = async (label, force = false) => {
        const key = String(label || "").trim();
        if (!key) {
          return false;
        }
        const cacheKey = force ? `${key}::force` : key;
        if (texturePrepareCache.has(cacheKey)) {
          return texturePrepareCache.get(cacheKey);
        }
        const promise = (async () => {
          try {
            const before = await App.apiGet(
              `/api/entry?label=${encodeURIComponent(key)}`
            );
            if (before?.preview?.available && !force) {
              return true;
            }
            if (!before?.preview?.exportable) {
              return Boolean(before?.preview?.available);
            }
            const response = await fetch(
              `/api/entry/preview/export?label=${encodeURIComponent(key)}&force=${
                force ? "1" : "0"
              }`,
              {
                method: "POST",
                headers: { Accept: "application/json" },
              }
            );
            if (!response.ok) {
              return false;
            }
            const payload = await response.json();
            const taskId = payload?.task?.id;
            if (!taskId) {
              return false;
            }
            await pollPreviewExportTaskSnapshot(taskId);
            const after = await App.apiGet(
              `/api/entry?label=${encodeURIComponent(key)}`
            );
            return Boolean(after?.preview?.available);
          } catch (err) {
            return false;
          }
        })();
        texturePrepareCache.set(cacheKey, promise);
        return promise;
      };

      const loadAssemblyTexture = async (label) => {
        const key = String(label || "").trim();
        if (!key) {
          return null;
        }
        if (textureCache.has(key)) {
          return textureCache.get(key);
        }
        const promise = (async () => {
          const previewUrl = previewItemUrl(key, "");
          let texture = await loadTextureFromUrl(previewUrl);
          if (texture) {
            return texture;
          }

          const repaired = await ensureAssemblyTexturePreview(key, true);
          if (!repaired) {
            const prepared = await ensureAssemblyTexturePreview(key, false);
            if (!prepared) {
              return loadTextureFromUrl(
                `/api/entry/plain?label=${encodeURIComponent(key)}`
              );
            }
          }

          texture = await loadTextureFromUrl(previewUrl);
          if (texture) {
            return texture;
          }
          return loadTextureFromUrl(
            `/api/entry/plain?label=${encodeURIComponent(key)}`
          );
        })();
        textureCache.set(key, promise);
        return promise;
      };

      const getAssemblyMissingTexture = () => {
        if (missingTexture) {
          return missingTexture;
        }
        if (typeof document === "undefined" || typeof document.createElement !== "function") {
          return null;
        }
        const size = 64;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          return null;
        }
        const block = size / 4;
        for (let y = 0; y < size; y += block) {
          for (let x = 0; x < size; x += block) {
            const odd = ((x / block) + (y / block)) % 2 === 0;
            ctx.fillStyle = odd ? "#c83dff" : "#2f1845";
            ctx.fillRect(x, y, block, block);
          }
        }
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2;
        ctx.strokeRect(1, 1, size - 2, size - 2);
        const texture = new THREE.CanvasTexture(canvas);
        texture.flipY = false;
        if ("colorSpace" in texture && "SRGBColorSpace" in THREE) {
          texture.colorSpace = THREE.SRGBColorSpace;
        }
        if ("RepeatWrapping" in THREE) {
          texture.wrapS = THREE.RepeatWrapping;
          texture.wrapT = THREE.RepeatWrapping;
        }
        if ("LinearFilter" in THREE) {
          texture.magFilter = THREE.LinearFilter;
        }
        if ("LinearMipmapLinearFilter" in THREE) {
          texture.minFilter = THREE.LinearMipmapLinearFilter;
        }
        texture.needsUpdate = true;
        missingTexture = texture;
        return missingTexture;
      };

      const applyAssemblyMissingTexture = (node) => {
        if (!node || !node.isMesh) {
          return false;
        }
        const texture = getAssemblyMissingTexture();
        if (!texture) {
          return false;
        }
        const materials = Array.isArray(node.material) ? node.material : [node.material];
        if (!materials.length) {
          return false;
        }
        let applied = false;
        materials.forEach((material, idx) => {
          if (!material) {
            return;
          }
          applied = true;
          if ("map" in material) {
            material.map = texture;
            if (material.color && typeof material.color.set === "function") {
              material.color.set(0xffffff);
            }
            if ("metalness" in material) {
              material.metalness = 0;
            }
            if ("roughness" in material) {
              material.roughness = 0.95;
            }
            if ("transparent" in material) {
              material.transparent = false;
            }
            if ("opacity" in material) {
              material.opacity = 1;
            }
            if ("side" in material && "DoubleSide" in THREE) {
              material.side = THREE.DoubleSide;
            }
            material.needsUpdate = true;
            return;
          }
          const fallback = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            map: texture,
            metalness: 0,
            roughness: 0.95,
            side: "DoubleSide" in THREE ? THREE.DoubleSide : material.side,
          });
          if (node.isSkinnedMesh && "skinning" in fallback) {
            fallback.skinning = true;
          }
          if (Array.isArray(node.material)) {
            node.material[idx] = fallback;
          } else {
            node.material = fallback;
          }
        });
        return applied;
      };

      const applyEyeLayerMaterialState = (node, material, textureRole = "") => {
        if (!node || !material) {
          return;
        }
        const meshName = String(node.name || "").toLowerCase();
        const role = String(textureRole || "").toLowerCase();
        const isLensMesh =
          meshName.includes("eyelens") ||
          (meshName.includes("eye") && meshName.includes("lens")) ||
          role === "lens";
        const isEyeMesh =
          meshName.includes("eye") &&
          !meshName.includes("eyelens") &&
          !meshName.includes("eyeshadow");

        if (isEyeMesh) {
          node.renderOrder = Math.max(Number(node.renderOrder) || 0, 26);
          if ("depthTest" in material) {
            material.depthTest = true;
          }
          if ("depthWrite" in material) {
            material.depthWrite = true;
          }
          if ("polygonOffset" in material) {
            material.polygonOffset = true;
            material.polygonOffsetFactor = 1;
            material.polygonOffsetUnits = 1;
          }
        }

        if (isLensMesh) {
          node.renderOrder = Math.max(Number(node.renderOrder) || 0, 34);
          if ("transparent" in material) {
            material.transparent = true;
          }
          if ("opacity" in material) {
            const opacity = Number.isFinite(material.opacity) ? material.opacity : 1;
            material.opacity = Math.min(opacity, 0.42);
          }
          if ("depthTest" in material) {
            material.depthTest = true;
          }
          if ("depthWrite" in material) {
            material.depthWrite = false;
          }
          if ("blending" in material && "NormalBlending" in THREE) {
            material.blending = THREE.NormalBlending;
          }
          if ("polygonOffset" in material) {
            material.polygonOffset = true;
            material.polygonOffsetFactor = -2;
            material.polygonOffsetUnits = -2;
          }
          if ("alphaTest" in material) {
            const alpha = Number.isFinite(material.alphaTest) ? material.alphaTest : 0;
            material.alphaTest = Math.max(alpha, 0.02);
          }
        }
      };

      const isStageSkyNode = (entry, node) => {
        if (!isStageAssemblyRoot(entry?.rootLabel || entry?.label)) {
          return false;
        }
        const text = `${entry?.name || ""} ${node?.name || ""}`.toLowerCase();
        return (
          text.includes("night_sky") ||
          text.includes("skybox") ||
          text.includes("skydome") ||
          /(^|[_\s-])sky([_\s-]|$)/.test(text)
        );
      };
      const isStageMoonNode = (entry, node) => {
        if (!isStageAssemblyRoot(entry?.rootLabel || entry?.label)) {
          return false;
        }
        const text = `${entry?.name || ""} ${node?.name || ""}`.toLowerCase();
        return text.includes("moon");
      };
      const isolateAssemblyNodeMaterials = (node) => {
        if (!node || !node.isMesh || !node.material) {
          return;
        }
        if (Array.isArray(node.material)) {
          node.material = node.material.map((material) => {
            if (!material || typeof material.clone !== "function") {
              return material;
            }
            const clone = material.clone();
            if (!clone.userData || typeof clone.userData !== "object") {
              clone.userData = {};
            }
            clone.userData.__assemblyIsolated = true;
            return clone;
          });
          return;
        }
        if (typeof node.material.clone === "function") {
          const clone = node.material.clone();
          if (!clone.userData || typeof clone.userData !== "object") {
            clone.userData = {};
          }
          clone.userData.__assemblyIsolated = true;
          node.material = clone;
        }
      };
      const applyStageSceneMaterialState = (
        entry,
        node,
        material,
        candidate = null
      ) => {
        if (!material || !isStageAssemblyRoot(entry?.rootLabel || entry?.label)) {
          return;
        }
        const meshText = `${entry?.name || ""} ${node?.name || ""}`.toLowerCase();
        const candidateText = assemblyTextureSearchText(candidate || {});
        const combined = `${meshText} ${candidateText}`;
        const isSky =
          combined.includes("night_sky") ||
          combined.includes("skybox") ||
          combined.includes("skydome");
        if (isSky) {
          return;
        }
        const isMoon = combined.includes("moon");
        const isGround =
          combined.includes("ground") ||
          combined.includes("stage_floor") ||
          combined.includes(" floor");
        const rhinoLike =
          combined.includes("_rhino") ||
          combined.includes("branchi_simple") ||
          combined.includes("alpha_simple") ||
          combined.includes("stage_stuffs");
        const foliageLike =
          combined.includes("sakura") ||
          combined.includes("branch") ||
          combined.includes("tree") ||
          combined.includes("leaf") ||
          combined.includes("petal") ||
          combined.includes("hanabira") ||
          combined.includes("stage_stuffs") ||
          combined.includes("alpha_rhino");
        const alphaLike =
          combined.includes("_alpha_") ||
          combined.includes(" alpha") ||
          combined.includes("cutout") ||
          foliageLike ||
          (rhinoLike && !isMoon && !isGround);
        if (alphaLike) {
          if ("transparent" in material) {
            material.transparent = true;
          }
          if ("opacity" in material) {
            const baseOpacity = Number.isFinite(material.opacity) ? material.opacity : 1;
            const targetOpacity = foliageLike ? 0.9 : 0.96;
            material.opacity = Math.min(baseOpacity, targetOpacity);
          }
          if ("alphaTest" in material) {
            const current = Number.isFinite(material.alphaTest)
              ? material.alphaTest
              : 0;
            material.alphaTest = Math.max(current, foliageLike ? 0.06 : 0.03);
          }
          if ("depthWrite" in material) {
            material.depthWrite = false;
          }
          if ("blending" in material && "NormalBlending" in THREE) {
            material.blending = THREE.NormalBlending;
          }
          if ("side" in material && "DoubleSide" in THREE) {
            material.side = THREE.DoubleSide;
          }
        }
        if (isMoon) {
          if ("transparent" in material) {
            material.transparent = true;
          }
          if ("alphaTest" in material) {
            const current = Number.isFinite(material.alphaTest)
              ? material.alphaTest
              : 0;
            material.alphaTest = Math.max(current, 0.15);
          }
          if ("depthWrite" in material) {
            material.depthWrite = false;
          }
          if ("side" in material && "DoubleSide" in THREE) {
            material.side = THREE.DoubleSide;
          }
        }
        if (isGround && !combined.includes("stage_floor")) {
          if ("transparent" in material) {
            material.transparent = true;
          }
          if ("alphaTest" in material) {
            const current = Number.isFinite(material.alphaTest)
              ? material.alphaTest
              : 0;
            material.alphaTest = Math.max(current, 0.02);
          }
        }
      };
      const sanitizeAssemblyColorMaterial = (material) => {
        if (!material) {
          return;
        }
        if ("vertexColors" in material) {
          material.vertexColors = false;
        }
        if ("emissive" in material && material.emissive?.set) {
          material.emissive.set(0x000000);
        }
        if ("emissiveMap" in material) {
          material.emissiveMap = null;
        }
        if ("aoMap" in material) {
          material.aoMap = null;
        }
        if ("lightMap" in material) {
          material.lightMap = null;
        }
        if ("metalnessMap" in material) {
          material.metalnessMap = null;
        }
        if ("roughnessMap" in material) {
          material.roughnessMap = null;
        }
        if ("normalMap" in material) {
          material.normalMap = null;
        }
        if ("bumpMap" in material) {
          material.bumpMap = null;
        }
        if ("alphaMap" in material) {
          material.alphaMap = null;
        }
      };
      const stageOrientationHint = (entry) => {
        if (!isStageAssemblyRoot(entry?.rootLabel || entry?.label)) {
          return "";
        }
        if (String(entry?.source || "").toLowerCase() === "self") {
          return "";
        }
        const text = `${entry?.name || ""} ${entry?.label || ""}`.toLowerCase();
        if (text.includes("shadowwall") || text.includes("shadow_wall")) {
          return "vertical";
        }
        if (text.includes("shadow")) {
          return "horizontal";
        }
        if (
          text.includes("ground_outfield") ||
          text.includes("ground_main") ||
          text.includes("stage_floor") ||
          text.includes("road") ||
          text.includes("track")
        ) {
          return "horizontal";
        }
        const horizontalTokens = [
          "ground",
          "floor",
          "road",
          "track",
          "outfield",
          "field",
          "stage",
          "snow",
        ];
        const verticalTokens = [
          "wall",
          "shadowwall",
          "shadow_wall",
          "fence",
          "curtain",
          "pillar",
          "tree",
          "bush",
          "kousya",
          "seimon",
          "window",
          "speaker",
          "truss",
          "gaito",
          "ongakudou",
          "taikukan",
          "syokudo",
          "watarirouka",
        ];
        if (verticalTokens.some((token) => text.includes(token))) {
          return "vertical";
        }
        if (horizontalTokens.some((token) => text.includes(token))) {
          return "horizontal";
        }
        return "";
      };
      const stageOrientationScore = (size, hint) => {
        const x = Math.max(0.001, Number(size?.x || 0));
        const y = Math.max(0.001, Number(size?.y || 0));
        const z = Math.max(0.001, Number(size?.z || 0));
        const horizontal = Math.max(x, z);
        if (hint === "vertical") {
          return y / horizontal;
        }
        if (hint === "horizontal") {
          return horizontal / y;
        }
        return 0;
      };
      const autoFixStageComponentAxis = (entry, object) => {
        const hint = stageOrientationHint(entry);
        if (!hint || !object) {
          return "";
        }
        object.userData = object.userData || {};
        if (!object.userData.__axisBaseQuat && object.quaternion?.clone) {
          object.userData.__axisBaseQuat = object.quaternion.clone();
        }
        const baseQuat = object.userData.__axisBaseQuat?.clone
          ? object.userData.__axisBaseQuat.clone()
          : object.quaternion.clone();
        const box = new THREE.Box3();
        const size = new THREE.Vector3();
        const evaluate = (quat) => {
          object.quaternion.copy(quat);
          object.updateMatrixWorld(true);
          box.setFromObject(object);
          if (box.isEmpty()) {
            return 0;
          }
          box.getSize(size);
          return stageOrientationScore(size, hint);
        };

        const candidates = [
          { id: "none", quat: baseQuat.clone() },
          {
            id: "x90",
            quat: new THREE.Quaternion()
              .setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0, "XYZ"))
              .multiply(baseQuat.clone()),
          },
          {
            id: "x-90",
            quat: new THREE.Quaternion()
              .setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0, "XYZ"))
              .multiply(baseQuat.clone()),
          },
          {
            id: "z90",
            quat: new THREE.Quaternion()
              .setFromEuler(new THREE.Euler(0, 0, Math.PI / 2, "XYZ"))
              .multiply(baseQuat.clone()),
          },
          {
            id: "z-90",
            quat: new THREE.Quaternion()
              .setFromEuler(new THREE.Euler(0, 0, -Math.PI / 2, "XYZ"))
              .multiply(baseQuat.clone()),
          },
        ];

        let baseScore = 0;
        let best = null;
        let bestScore = -1;
        candidates.forEach((candidate, index) => {
          const score = evaluate(candidate.quat);
          if (index === 0) {
            baseScore = score;
          }
          if (score > bestScore) {
            bestScore = score;
            best = candidate;
          }
        });

        const verticalImproved =
          hint === "vertical" &&
          bestScore > Math.max(baseScore * 1.9, 1.15) &&
          bestScore - baseScore > 0.45;
        const horizontalImproved =
          hint === "horizontal" &&
          bestScore > Math.max(baseScore * 2.2, 3.0) &&
          bestScore - baseScore > 1.8;
        const canFix =
          Boolean(best) &&
          best.id !== "none" &&
          (verticalImproved || horizontalImproved);
        if (canFix) {
          object.quaternion.copy(best.quat);
          object.updateMatrixWorld(true);
          object.userData = object.userData || {};
          object.userData.__axisAutoFixed = best.id;
          return best.id;
        }
        object.quaternion.copy(baseQuat);
        object.updateMatrixWorld(true);
        return "";
      };
      const stageOwnerLikelyTerrainEntry = (entry) => {
        if (!isStageAssemblyRoot(entry?.rootLabel || entry?.label)) {
          return false;
        }
        const text = `${entry?.name || ""} ${entry?.label || ""}`.toLowerCase();
        return (
          text.includes("ground") ||
          text.includes("outfield") ||
          text.includes("road") ||
          text.includes("track") ||
          text.includes("floor") ||
          text.includes("stage_floor")
        );
      };
      const stageHorizontalShapeScore = (object, quat) => {
        if (!object || !quat) {
          return 0;
        }
        const box = new THREE.Box3();
        const size = new THREE.Vector3();
        object.quaternion.copy(quat);
        object.updateMatrixWorld(true);
        box.setFromObject(object);
        if (box.isEmpty()) {
          return 0;
        }
        box.getSize(size);
        const x = Math.max(0.001, Number(size.x || 0));
        const y = Math.max(0.001, Number(size.y || 0));
        const z = Math.max(0.001, Number(size.z || 0));
        return Math.max(x, z) / y;
      };
      const stageOwnerAxisOverrideMap = new Map([
        ["3d_stage_38|__sc_bg038_gakuen_all_00.fbx", "x-90"],
      ]);
      const stageOwnerAxisOverride = (entry) => {
        const root = String(entry?.rootLabel || "").toLowerCase();
        const owner = String(entry?.label || "").toLowerCase();
        if (!root || !owner) {
          return "";
        }
        return stageOwnerAxisOverrideMap.get(`${root}|${owner}`) || "";
      };
      const stageComponentAxisPolicy = (entry) => {
        if (!isStageAssemblyRoot(entry?.rootLabel || entry?.label)) {
          return "";
        }
        if (entry?.isStageAggregate) {
          return "none";
        }
        const text = `${entry?.name || ""} ${entry?.label || ""}`.toLowerCase();
        if (text.includes("shadow") && !text.includes("shadowwall") && !text.includes("shadow_wall")) {
          return "none";
        }
        return "";
      };
      const applyStageOwnerAxisFix = (object, fixId = "") => {
        if (!object || !fixId) {
          return false;
        }
        object.userData = object.userData || {};
        if (!object.userData.__axisBaseQuat && object.quaternion?.clone) {
          object.userData.__axisBaseQuat = object.quaternion.clone();
        }
        const baseQuat = object.userData.__axisBaseQuat?.clone
          ? object.userData.__axisBaseQuat.clone()
          : object.quaternion.clone();
        let delta = null;
        switch (String(fixId || "").toLowerCase()) {
          case "x90":
            delta = new THREE.Quaternion().setFromEuler(
              new THREE.Euler(Math.PI / 2, 0, 0, "XYZ")
            );
            break;
          case "x-90":
            delta = new THREE.Quaternion().setFromEuler(
              new THREE.Euler(-Math.PI / 2, 0, 0, "XYZ")
            );
            break;
          case "z90":
            delta = new THREE.Quaternion().setFromEuler(
              new THREE.Euler(0, 0, Math.PI / 2, "XYZ")
            );
            break;
          case "z-90":
            delta = new THREE.Quaternion().setFromEuler(
              new THREE.Euler(0, 0, -Math.PI / 2, "XYZ")
            );
            break;
          default:
            delta = null;
        }
        if (!delta) {
          return false;
        }
        object.quaternion.copy(delta.multiply(baseQuat));
        object.updateMatrixWorld(true);
        object.userData.__axisOwnerFixed = String(fixId || "").toLowerCase();
        return true;
      };

      const updateAssemblyTextureStatus = (entry, summary = {}) => {
        if (!entry?.textureStateNode) {
          return;
        }
        const total = Math.max(0, Number(summary?.total || 0));
        const matched = Math.max(0, Number(summary?.matched || 0));
        const unmatched = Math.max(0, Number(summary?.unmatched || 0));
        const matchedLabels = Array.isArray(summary?.matchedLabels)
          ? summary.matchedLabels
              .map((item) => String(item || "").trim())
              .filter(Boolean)
          : [];
        const manualLabel = String(summary?.manualLabel || "").trim();
        let text = "";
        if (manualLabel === "__none__") {
          text = I18n.t("view.prefabAssemblyTextureStateNone");
        } else if (manualLabel) {
          text = I18n.t("view.prefabAssemblyTextureStateManual", { label: manualLabel });
        } else if (total > 0 && matched === 0) {
          text = I18n.t("view.prefabAssemblyTextureStateNone");
        } else if (unmatched > 0) {
          text = I18n.t("view.prefabAssemblyTextureStatePartial", {
            matched: String(matched),
            total: String(total),
          });
        } else {
          text = I18n.t("view.prefabAssemblyTextureStateAuto");
        }
        if (!manualLabel && matchedLabels.length === 1 && matched > 0) {
          text = `${text} · ${matchedLabels[0]}`;
        } else if (!manualLabel && matchedLabels.length > 1 && matched > 0) {
          text = `${text} · ${matchedLabels[0]} +${matchedLabels.length - 1}`;
        }
        entry.textureStateNode.textContent = text;
        entry.textureStateNode.title =
          manualLabel && manualLabel !== "__none__"
            ? manualLabel
            : matchedLabels.length
            ? matchedLabels.join("\n")
            : "";
        entry.textureStateNode.classList.toggle(
          "is-no-match",
          manualLabel === "__none__" || (total > 0 && matched === 0)
        );
        if (entry.row) {
          entry.row.classList.toggle(
            "texture-unmatched",
            manualLabel === "__none__" || (total > 0 && matched === 0)
          );
        }
      };

      const applyAssemblyTextures = async (entry, object) => {
        if (!entry || !object) {
          return;
        }
        const manualLabel = String(entry?.textureOverrideLabel || "").trim();
        if (!textureCandidates.length) {
          let totalMeshes = 0;
          object.traverse((node) => {
            if (!node || !node.isMesh || !node.visible) {
              return;
            }
            totalMeshes += 1;
            isolateAssemblyNodeMaterials(node);
            applyAssemblyMissingTexture(node);
          });
          updateAssemblyTextureStatus(entry, {
            total: totalMeshes,
            matched: 0,
            unmatched: totalMeshes,
            manualLabel,
            matchedLabels: [],
          });
          return;
        }
        const manualCandidate = manualLabel && manualLabel !== "__none__"
          ? textureCandidates.find((candidate) => candidate?.label === manualLabel) || null
          : null;
        const jobs = [];
        let totalMeshes = 0;
        let matchedMeshes = 0;
        const matchedLabelSet = new Set();
        object.traverse((node) => {
          if (!node || !node.isMesh || !node.visible) {
            return;
          }
          totalMeshes += 1;
          isolateAssemblyNodeMaterials(node);
          const stageSkyNode = isStageSkyNode(entry, node);
          if (stageSkyNode) {
            const materials = Array.isArray(node.material)
              ? node.material
              : [node.material];
            materials.forEach((material) => {
              if (!material) {
                return;
              }
              // Stage sky domes in current exports are inward-facing. FrontSide
              // keeps them visible from inside and culled from outside.
              if ("side" in material && "FrontSide" in THREE) {
                material.side = THREE.FrontSide;
                material.needsUpdate = true;
              }
            });
          }
          const meshName = node.name || entry.name || "";
          const stageMoonNode = isStageMoonNode(entry, node);
          let candidatePool = textureCandidates;
          if (stageSkyNode) {
            const skyPool = textureCandidates.filter((candidate) => {
              const text = assemblyTextureSearchText(candidate);
              const looksSky =
                text.includes("night_sky") ||
                text.includes("skybox") ||
                text.includes("skydome") ||
                /(^|[_\s-])sky([_\s-]|$)/.test(text);
              return (
                looksSky &&
                !text.includes("moon") &&
                !text.includes("probemap")
              );
            });
            if (skyPool.length) {
              candidatePool = skyPool;
            } else {
              candidatePool = [];
            }
          } else if (stageMoonNode) {
            const moonPool = textureCandidates.filter((candidate) =>
              assemblyTextureSearchText(candidate).includes("moon")
            );
            if (moonPool.length) {
              candidatePool = moonPool;
            } else {
              candidatePool = [];
            }
          }
          let match = null;
          if (manualLabel === "__none__") {
            match = null;
          } else if (manualCandidate?.label) {
            match = {
              candidate: manualCandidate,
              score: 99999,
              info: {
                manual: true,
                ownerMatched: true,
                specificOverlapCount: 99,
                phraseMatchCount: 99,
                targetDomain: assemblyTextureDomain(`${entry?.name || ""} ${meshName || ""}`),
                candidateDomain: assemblyTextureDomain(
                  `${manualCandidate?.label || ""} ${(manualCandidate?.materials || []).join(" ")}`
                ),
              },
            };
          } else {
            match = selectAssemblyTextureCandidate(candidatePool, entry, meshName);
          }
          const chosen = match?.candidate || null;
          if (!chosen || !chosen.label) {
            applyAssemblyMissingTexture(node);
            return;
          }
          jobs.push(
            loadAssemblyTexture(chosen.label).then((texture) => {
              if (!texture) {
                applyAssemblyMissingTexture(node);
                return;
              }
              const materials = Array.isArray(node.material)
                ? node.material
                : [node.material];
              let appliedMatch = false;
              materials.forEach((material, idx) => {
                if (!material) {
                  return;
                }
                const stageAssembly = isStageAssemblyRoot(
                  entry?.rootLabel || entry?.label
                );
                const manualMatch = Boolean(match?.info?.manual);
                const knownDomainMatch =
                  match?.info?.targetDomain &&
                  match?.info?.candidateDomain &&
                  match.info.targetDomain !== "unknown" &&
                  match.info.candidateDomain !== "unknown" &&
                  assemblyTextureDomainCompatible(
                    match.info.targetDomain,
                    match.info.candidateDomain
                  );
                const strongAutoMatch =
                  manualMatch ||
                  knownDomainMatch ||
                  Boolean(match?.info?.ownerMatched) ||
                  Number(match?.info?.specificOverlapCount || 0) >= 2 ||
                  Number(match?.info?.phraseMatchCount || 0) >= 1 ||
                  Number(match?.score || 0) >= 108;
                if ("map" in material) {
                  const hasExistingMap = Boolean(
                    material.map &&
                      (material.map.isTexture ||
                        material.map.image ||
                        material.map.source)
                  );
                  const shouldApplyMap =
                    !hasExistingMap || !stageAssembly || strongAutoMatch;
                  if (shouldApplyMap) {
                    appliedMatch = true;
                    if (stageAssembly) {
                      sanitizeAssemblyColorMaterial(material);
                    }
                    material.map = texture;
                    if (material.color && typeof material.color.set === "function") {
                      material.color.set(0xffffff);
                    }
                    if ("metalness" in material) {
                      material.metalness = 0;
                    }
                    if ("roughness" in material) {
                      material.roughness = Math.min(
                        0.92,
                        Number.isFinite(material.roughness) ? material.roughness : 0.92
                      );
                    }
                    if ("emissiveIntensity" in material) {
                      material.emissiveIntensity = Math.max(
                        0.06,
                        Number.isFinite(material.emissiveIntensity)
                          ? material.emissiveIntensity
                          : 0.06
                      );
                    }
                    applyStageSceneMaterialState(entry, node, material, chosen);
                    applyEyeLayerMaterialState(node, material, chosen.role);
                    if (!stageSkyNode && "side" in material && "DoubleSide" in THREE) {
                      material.side = THREE.DoubleSide;
                    }
                  } else if (hasExistingMap) {
                    appliedMatch = true;
                  }
                  if (stageSkyNode && "FrontSide" in THREE) {
                    material.side = THREE.FrontSide;
                  }
                  material.needsUpdate = true;
                  return;
                }

                if (!strongAutoMatch && !manualMatch) {
                  return;
                }
                appliedMatch = true;
                const fallback = new THREE.MeshStandardMaterial({
                  color: 0xffffff,
                  map: texture,
                  metalness: 0,
                  roughness: 0.88,
                  side: material.side,
                });
                if (stageAssembly) {
                  sanitizeAssemblyColorMaterial(fallback);
                }
                fallback.transparent = Boolean(material.transparent);
                if (Number.isFinite(material.opacity)) {
                  fallback.opacity = material.opacity;
                }
                if (stageSkyNode && "FrontSide" in THREE) {
                  fallback.side = THREE.FrontSide;
                } else {
                  fallback.side = THREE.DoubleSide;
                }
                applyStageSceneMaterialState(entry, node, fallback, chosen);
                if (node.isSkinnedMesh && "skinning" in fallback) {
                  fallback.skinning = true;
                }
                if (Array.isArray(node.material)) {
                  node.material[idx] = fallback;
                } else {
                  node.material = fallback;
                }
                applyEyeLayerMaterialState(node, fallback, chosen.role);
              });
              if (appliedMatch) {
                matchedMeshes += 1;
                matchedLabelSet.add(chosen.label);
                return;
              }
              applyAssemblyMissingTexture(node);
            })
          );
        });
        if (jobs.length) {
          await Promise.allSettled(jobs);
          object.updateMatrixWorld(true);
        }
        updateAssemblyTextureStatus(entry, {
          total: totalMeshes,
          matched: matchedMeshes,
          unmatched: Math.max(0, totalMeshes - matchedMeshes),
          manualLabel,
          matchedLabels: [...matchedLabelSet].sort(),
        });
      };

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
      requestAnimationFrame(resize);
      setTimeout(resize, 140);

      const fitCameraToVisible = () => {
        const box = new THREE.Box3();
        let hasMesh = false;
        const isWorldVisible = (obj) => {
          let current = obj;
          while (current) {
            if (!current.visible) {
              return false;
            }
            current = current.parent;
          }
          return true;
        };
        root.traverse((obj) => {
          if (!obj.isMesh || !isWorldVisible(obj)) {
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
        const offset = new THREE.Vector3(0.9, 0.66, 1)
          .normalize()
          .multiplyScalar(distance);
        camera.position.copy(center).add(offset);
        camera.near = Math.max(distance / 280, 0.01);
        camera.far = Math.max(distance * 30, 80);
        camera.updateProjectionMatrix();
        controls.target.copy(center);
        controls.update();
        grid.position.y = box.min.y;
      };

      const updateStatus = (loaded, failed, done = false, failureReason = "") => {
        const total = entries.length;
        if (!done) {
          statusEl.textContent = I18n.t("view.prefabAssemblyLoading", {
            loaded: String(loaded),
            total: String(total),
          });
          return;
        }
        if (loaded === 0 || failed === total) {
          const reason = normalizeAssemblyError(failureReason);
          statusEl.textContent = reason
            ? `${I18n.t("view.prefabAssemblyFailed")} (${reason})`
            : I18n.t("view.prefabAssemblyFailed");
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
            const duplicateHidden =
              sizeDedupEnabled &&
              Boolean(entry.isAutoDuplicate) &&
              !showAutoDuplicates;
            entry.object.visible = Boolean(entry.enabled) && !duplicateHidden;
          }
          if (entry.checkbox) {
            entry.checkbox.disabled =
              sizeDedupEnabled &&
              Boolean(entry.isAutoDuplicate) &&
              !showAutoDuplicates;
          }
          if (entry.row) {
            entry.row.classList.toggle(
              "duplicate-hidden",
              sizeDedupEnabled &&
                Boolean(entry.isAutoDuplicate) &&
                !showAutoDuplicates
            );
          }
        });
        if (hooks.onDuplicateUpdate) {
          hooks.onDuplicateUpdate({
            enabled: sizeDedupEnabled,
            count: autoDuplicateCount,
            show: showAutoDuplicates,
          });
        }
      };

      const refreshRigInfo = () => {
        latestRigInfo = collectAssemblyRigInfo(root);
        if (hooks.onRigUpdate) {
          hooks.onRigUpdate(latestRigInfo);
        }
      };

      const exportAsGlb = async (progress) => {
        const report = (percent, phase, state = "running", message = "") => {
          if (typeof progress === "function") {
            progress({ percent, phase, state, message });
          }
        };

        let visibleMeshes = 0;
        root.traverse((obj) => {
          if (obj && obj.isMesh && obj.visible) {
            visibleMeshes += 1;
          }
        });
        if (visibleMeshes === 0) {
          throw new Error(I18n.t("view.prefabAssemblyExportNoVisible"));
        }

        report(5, "prepare", "running");
        const enabledSignature = entries
          .filter((item) => item?.enabled)
          .map((item) => `${item.label || rootLabel}:${item.itemId || ""}`)
          .sort()
          .join("|");
        const signature = await hashText(
          `${rootLabel}|visible=${visibleMeshes}|${enabledSignature}`
        );
        const cacheKey = `${sanitizeExportFileName(rootLabel)}-${signature}`;
        const baseName = sanitizeExportFileName(rootLabel);
        const fileName = `${baseName}_assembly.glb`;

        if (assemblyExportMemoryCache.has(cacheKey)) {
          report(100, "cached", "success");
          return assemblyExportMemoryCache.get(cacheKey);
        }
        const persistent = await readAssemblyExportPersistentCache(cacheKey);
        if (persistent?.blob) {
          const cached = {
            blob: persistent.blob,
            filename: persistent.filename || fileName,
          };
          rememberAssemblyExportInMemory(cacheKey, cached);
          report(100, "cached", "success");
          return cached;
        }

        report(18, "collect", "running");
        const exporter = new GLTFExporter();
        let progressValue = 24;
        const pulse = setInterval(() => {
          progressValue = Math.min(90, progressValue + 2.2);
          report(progressValue, "export", "running");
        }, 220);

        let result = null;
        try {
          result = await new Promise((resolve, reject) => {
            exporter.parse(
              root,
              (output) => resolve(output),
              (err) => reject(err || new Error("export failed")),
              {
                binary: true,
                onlyVisible: true,
                includeCustomExtensions: true,
              }
            );
          });
        } finally {
          clearInterval(pulse);
        }

        let blob = null;
        if (result instanceof ArrayBuffer) {
          blob = new Blob([result], { type: "model/gltf-binary" });
        } else if (typeof result === "string") {
          blob = new Blob([result], { type: "model/gltf+json" });
        } else {
          blob = new Blob([JSON.stringify(result)], { type: "model/gltf+json" });
        }

        report(94, "cache", "running");
        const output = { blob, filename: fileName };
        rememberAssemblyExportInMemory(cacheKey, output);
        await writeAssemblyExportPersistentCache(cacheKey, blob, fileName);
        report(100, "done", "success");
        return output;
      };

      entries.forEach((entry) => {
        if (!entry.checkbox) {
          return;
        }
        entry.checkbox.onchange = () => {
          entry.enabled = Boolean(entry.checkbox.checked);
          refreshVisibility();
          if (entry.enabled && entry.object) {
            applyAssemblyTextures(entry, entry.object);
          }
        };
        if (entry.textureSelect) {
          entry.textureSelect.onchange = () => {
            const value = String(entry.textureSelect.value || "").trim();
            entry.textureOverrideLabel = value === "__auto__" ? "" : value;
            if (entry.object) {
              applyAssemblyTextures(entry, entry.object);
            } else {
              updateAssemblyTextureStatus(entry, {
                total: 0,
                matched: 0,
                unmatched: 0,
                manualLabel: entry.textureOverrideLabel,
              });
            }
            if (typeof hooks.onTextureOverrideChange === "function") {
              hooks.onTextureOverrideChange(entry);
            }
          };
        }
      });

      if (hooks.onReady) {
        hooks.onReady({
          exportAsGlb,
          setShowAutoDuplicates(flag) {
            showAutoDuplicates = Boolean(flag);
            refreshVisibility();
          },
        });
      }

      const loader = new GLTFLoader();
      const sizeBuckets = new Map();
      const stageOwnerAxisFixMap = new Map();
      const stageOwnerObjectsMap = new Map();
      const parseGltfFromArrayBuffer = (url, buffer) =>
        new Promise((resolve, reject) => {
          const baseUrl = String(url || "").replace(/[^/]*$/, "");
          loader.parse(
            buffer,
            baseUrl,
            (gltf) => resolve(gltf),
            (err) => reject(err || new Error("parse failed"))
          );
        });

      const loadAssemblyEntry = async (url) => {
        const response = await fetch(url, {
          method: "GET",
          cache: "force-cache",
        });
        if (!response.ok) {
          throw new Error(`http ${response.status}`);
        }
        const buffer = await response.arrayBuffer();
        const gltf = await parseGltfFromArrayBuffer(url, buffer);
        return {
          gltf,
          byteSize: Number(buffer.byteLength || 0),
        };
      };
      const collectAssemblyGeometryStats = (object) => {
        const stats = {
          meshCount: 0,
          triangleCount: 0,
          vertexCount: 0,
          maxDim: 0,
        };
        if (!object) {
          return stats;
        }
        const box = new THREE.Box3();
        const size = new THREE.Vector3();
        let hasBounds = false;
        object.traverse((node) => {
          if (!node || !node.isMesh || !node.geometry) {
            return;
          }
          stats.meshCount += 1;
          const geometry = node.geometry;
          const pos = geometry?.attributes?.position;
          const vertexCount = Number(pos?.count || 0);
          if (vertexCount > 0) {
            stats.vertexCount += vertexCount;
          }
          const indexCount = Number(geometry?.index?.count || 0);
          if (indexCount > 0) {
            stats.triangleCount += Math.floor(indexCount / 3);
          } else if (vertexCount > 0) {
            stats.triangleCount += Math.floor(vertexCount / 3);
          }
          box.expandByObject(node);
          hasBounds = true;
        });
        if (hasBounds && !box.isEmpty()) {
          box.getSize(size);
          stats.maxDim = Math.max(size.x, size.y, size.z, 0);
        }
        return stats;
      };
      const isLocatorNameHint = (entry) => {
        const text = `${entry?.name || ""} ${entry?.itemId || ""}`.toLowerCase();
        return (
          text.includes("ignore") ||
          text.includes("locator") ||
          text.includes("dummy") ||
          text.includes("null") ||
          text.includes("pivot") ||
          text.includes("marker") ||
          text.includes("helper") ||
          text.includes("anchor")
        );
      };
      const shouldAutoHideTinyLocator = (entry, byteSize, stats) => {
        if (!isStageAssemblyRoot(entry?.rootLabel || entry?.label)) {
          return false;
        }
        const size = Number(byteSize || 0);
        const triangles = Number(stats?.triangleCount || 0);
        const meshes = Number(stats?.meshCount || 0);
        const vertices = Number(stats?.vertexCount || 0);
        const maxDim = Number(stats?.maxDim || 0);
        if (meshes === 0 || vertices === 0) {
          return true;
        }
        if (isLocatorNameHint(entry) && size <= 256 * 1024) {
          return true;
        }
        if (size > 0 && size <= 96 * 1024 && triangles <= 8 && maxDim <= 0.15) {
          return true;
        }
        if (size > 0 && size <= 48 * 1024 && meshes <= 2 && triangles <= 64 && maxDim <= 0.5) {
          return true;
        }
        if (size > 0 && size <= 24 * 1024 && meshes <= 2 && triangles <= 120 && maxDim <= 0.35) {
          return true;
        }
        if (size > 0 && size <= 192 * 1024 && triangles <= 2) {
          return true;
        }
        if (vertices <= 16 && triangles <= 8 && maxDim <= 0.25) {
          return true;
        }
        return false;
      };
      const inferStageOwnerAxisFix = (entry, object) => {
        if (!stageOwnerLikelyTerrainEntry(entry) || !object) {
          return "";
        }
        object.userData = object.userData || {};
        if (!object.userData.__axisBaseQuat && object.quaternion?.clone) {
          object.userData.__axisBaseQuat = object.quaternion.clone();
        }
        const baseQuat = object.userData.__axisBaseQuat?.clone
          ? object.userData.__axisBaseQuat.clone()
          : object.quaternion.clone();
        const candidates = [
          {
            id: "x90",
            quat: new THREE.Quaternion()
              .setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0, "XYZ"))
              .multiply(baseQuat.clone()),
          },
          {
            id: "x-90",
            quat: new THREE.Quaternion()
              .setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0, "XYZ"))
              .multiply(baseQuat.clone()),
          },
          {
            id: "z90",
            quat: new THREE.Quaternion()
              .setFromEuler(new THREE.Euler(0, 0, Math.PI / 2, "XYZ"))
              .multiply(baseQuat.clone()),
          },
          {
            id: "z-90",
            quat: new THREE.Quaternion()
              .setFromEuler(new THREE.Euler(0, 0, -Math.PI / 2, "XYZ"))
              .multiply(baseQuat.clone()),
          },
        ];
        const baseScore = stageHorizontalShapeScore(object, baseQuat);
        let bestId = "";
        let bestScore = baseScore;
        candidates.forEach((candidate) => {
          const score = stageHorizontalShapeScore(object, candidate.quat);
          if (score > bestScore) {
            bestScore = score;
            bestId = candidate.id;
          }
        });
        object.quaternion.copy(baseQuat);
        object.updateMatrixWorld(true);
        if (
          !bestId ||
          !bestId.startsWith("x") ||
          bestScore < Math.max(baseScore * 2.3, 3.4) ||
          bestScore - baseScore < 1.9
        ) {
          return "";
        }
        return bestId;
      };
      const applyStageOwnerFixToOwnerObjects = (owner, fixId) => {
        if (!owner || !fixId) {
          return;
        }
        const list = stageOwnerObjectsMap.get(owner);
        if (!Array.isArray(list) || !list.length) {
          return;
        }
        list.forEach((object) => applyStageOwnerAxisFix(object, fixId));
      };
      const loadAll = async () => {
        let loaded = 0;
        let failed = 0;
        let firstFailureReason = "";
        updateStatus(loaded, failed, false);

        for (const entry of entries) {
          if (disposed) {
            return;
          }
          const label = entry.label || rootLabel;
          const itemId = entry.itemId || "";
          const url = previewItemUrl(label, itemId);
          try {
            const payload = await loadAssemblyEntry(url);
            const gltf = payload.gltf;
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
            entry.byteSize = Number(payload.byteSize || 0);
            entry.geometryStats = collectAssemblyGeometryStats(object);
            if (
              shouldAutoHideTinyLocator(
                entry,
                entry.byteSize,
                entry.geometryStats
              )
            ) {
              entry.enabled = false;
              if (entry.checkbox) {
                entry.checkbox.checked = false;
              }
              if (entry.row) {
                entry.row.classList.add("locator");
              }
              if (entry.metaNode) {
                const line = document.createElement("div");
                line.className = "prefab-assembly-locator-meta";
                line.textContent = I18n.t("view.prefabAssemblyLocatorItem", {
                  size: App.formatBytes(entry.byteSize),
                  triangles: String(Math.max(0, Number(entry.geometryStats?.triangleCount || 0))),
                });
                entry.metaNode.appendChild(line);
              }
            }
            object.visible = Boolean(entry.enabled);
            root.add(object);
            entry.object = object;
            const componentAxisPolicy = stageComponentAxisPolicy(entry);
            if (componentAxisPolicy === "none") {
              // Keep original transform for aggregate/shadow components.
            } else if (componentAxisPolicy) {
              applyStageOwnerAxisFix(object, componentAxisPolicy);
            } else {
              const overrideFix = stageOwnerAxisOverride(entry);
              if (overrideFix) {
                applyStageOwnerAxisFix(object, overrideFix);
              } else {
                autoFixStageComponentAxis(entry, object);
              }
            }

            if (sizeDedupEnabled && entry.byteSize > 0) {
              const key = String(entry.byteSize);
              if (sizeBuckets.has(key)) {
                const first = sizeBuckets.get(key);
                entry.isAutoDuplicate = true;
                entry.duplicateOf = first || null;
                entry.enabled = false;
                if (entry.checkbox) {
                  entry.checkbox.checked = false;
                }
                if (entry.row) {
                  entry.row.classList.add("duplicate");
                }
                if (entry.metaNode) {
                  const line = document.createElement("div");
                  line.className = "prefab-assembly-duplicate-meta";
                  line.textContent = I18n.t("view.prefabAssemblyDuplicateItem", {
                    size: App.formatBytes(entry.byteSize),
                  });
                  entry.metaNode.appendChild(line);
                }
                autoDuplicateCount += 1;
              } else {
                sizeBuckets.set(key, entry);
                entry.isAutoDuplicate = false;
              }
            }

            await applyAssemblyTextures(entry, object);
            loaded += 1;
            if (entry.row) {
              entry.row.classList.add("loaded");
            }
            refreshRigInfo();
            refreshVisibility();
          } catch (err) {
            failed += 1;
            if (!firstFailureReason) {
              firstFailureReason = normalizeAssemblyError(err);
            }
            if (entry.row) {
              entry.row.classList.add("failed");
              const text = normalizeAssemblyError(err);
              if (text) {
                entry.row.title = text;
              }
            }
          }
          updateStatus(loaded, failed, false);
          fitCameraToVisible();
        }
        updateStatus(loaded, failed, true, firstFailureReason);
        refreshRigInfo();
        refreshVisibility();
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
    .catch((err) => {
      if (!disposed) {
        const reason = normalizeAssemblyError(err);
        statusEl.textContent = reason
          ? `${I18n.t("view.prefabAssemblyFailed")} (${reason})`
          : I18n.t("view.prefabAssemblyFailed");
      }
      if (hooks.onRigUpdate) {
        hooks.onRigUpdate({
          available: false,
          profiles: [],
          skeletonCount: 0,
          totalBones: 0,
          mappedJointCount: 0,
          humanoid: false,
        });
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

function createPrefabAssemblySection(assembly, rootLabel, dependencies = []) {
  const normalizedRootLabel = String(rootLabel || "").toLowerCase();
  const sizeDedupEnabled = normalizedRootLabel.startsWith("3d_item_");
  const stageAssemblyRoot = isStageAssemblyRoot(rootLabel);
  const section = document.createElement("section");
  section.className = "prefab-section prefab-assembly";

  const title = document.createElement("h4");
  title.textContent = I18n.t("view.prefabAssemblyTitle");
  section.appendChild(title);

  const hint = document.createElement("div");
  hint.className = "prefab-assembly-hint";
  hint.textContent = I18n.t("view.prefabAssemblyHint");
  section.appendChild(hint);

  const controls = document.createElement("div");
  controls.className = "prefab-assembly-toolbar";

  const exportButton = document.createElement("button");
  exportButton.type = "button";
  exportButton.className = "btn btn-outline-dark btn-sm";
  exportButton.textContent = I18n.t("view.prefabAssemblyExportButton");
  exportButton.disabled = true;
  controls.appendChild(exportButton);

  const prepareButton = document.createElement("button");
  prepareButton.type = "button";
  prepareButton.className = "btn btn-outline-dark btn-sm d-none";
  prepareButton.textContent = I18n.t("view.prefabAssemblyPrepareButton", { count: "0" });
  prepareButton.disabled = true;
  controls.appendChild(prepareButton);

  const saveTextureMappingButton = document.createElement("button");
  saveTextureMappingButton.type = "button";
  saveTextureMappingButton.className = "btn btn-outline-dark btn-sm";
  saveTextureMappingButton.textContent = I18n.t(
    "view.prefabAssemblyMappingSaveButton"
  );
  saveTextureMappingButton.disabled = true;
  controls.appendChild(saveTextureMappingButton);

  const clearTextureMappingButton = document.createElement("button");
  clearTextureMappingButton.type = "button";
  clearTextureMappingButton.className = "btn btn-outline-dark btn-sm";
  clearTextureMappingButton.textContent = I18n.t(
    "view.prefabAssemblyMappingClearButton"
  );
  clearTextureMappingButton.disabled = true;
  controls.appendChild(clearTextureMappingButton);

  const duplicateToggle = document.createElement("label");
  duplicateToggle.className = "prefab-assembly-toggle";
  if (!sizeDedupEnabled) {
    duplicateToggle.classList.add("d-none");
  }
  const duplicateToggleInput = document.createElement("input");
  duplicateToggleInput.type = "checkbox";
  duplicateToggleInput.disabled = true;
  const duplicateToggleText = document.createElement("span");
  duplicateToggleText.textContent = I18n.t("view.prefabAssemblyShowDuplicates");
  duplicateToggle.appendChild(duplicateToggleInput);
  duplicateToggle.appendChild(duplicateToggleText);
  controls.appendChild(duplicateToggle);

  const layoutWidthControl = document.createElement("label");
  layoutWidthControl.className = "prefab-assembly-layout-field";
  const layoutWidthText = document.createElement("span");
  layoutWidthControl.appendChild(layoutWidthText);
  const layoutWidthInput = document.createElement("input");
  layoutWidthInput.type = "range";
  layoutWidthInput.min = "260";
  layoutWidthInput.max = "840";
  layoutWidthInput.step = "10";
  layoutWidthControl.appendChild(layoutWidthInput);
  controls.appendChild(layoutWidthControl);

  const layoutHeightControl = document.createElement("label");
  layoutHeightControl.className = "prefab-assembly-layout-field";
  const layoutHeightText = document.createElement("span");
  layoutHeightControl.appendChild(layoutHeightText);
  const layoutHeightInput = document.createElement("input");
  layoutHeightInput.type = "range";
  layoutHeightInput.min = "180";
  layoutHeightInput.max = "920";
  layoutHeightInput.step = "10";
  layoutHeightControl.appendChild(layoutHeightInput);
  controls.appendChild(layoutHeightControl);

  const layoutColumnsControl = document.createElement("label");
  layoutColumnsControl.className = "prefab-assembly-layout-field";
  const layoutColumnsText = document.createElement("span");
  layoutColumnsText.textContent = I18n.t("view.prefabAssemblyLayoutColumns");
  layoutColumnsControl.appendChild(layoutColumnsText);
  const layoutColumnsSelect = document.createElement("select");
  layoutColumnsSelect.className = "form-select form-select-sm";
  [
    ["auto", "view.prefabAssemblyLayoutColumnsAuto"],
    ["1", "view.prefabAssemblyLayoutColumns1"],
    ["2", "view.prefabAssemblyLayoutColumns2"],
    ["3", "view.prefabAssemblyLayoutColumns3"],
  ].forEach(([value, key]) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = I18n.t(key);
    layoutColumnsSelect.appendChild(option);
  });
  layoutColumnsControl.appendChild(layoutColumnsSelect);
  controls.appendChild(layoutColumnsControl);
  section.appendChild(controls);

  const textureMappingStatus = document.createElement("div");
  textureMappingStatus.className = "prefab-assembly-mapping-status d-none";
  section.appendChild(textureMappingStatus);

  const pendingHint = document.createElement("div");
  pendingHint.className = "prefab-assembly-pending d-none";
  section.appendChild(pendingHint);

  const rigInfo = document.createElement("div");
  rigInfo.className = "prefab-assembly-rig";
  rigInfo.textContent = I18n.t("view.prefabRigDetecting");
  section.appendChild(rigInfo);

  const duplicateInfo = document.createElement("div");
  duplicateInfo.className = "prefab-assembly-dedup d-none";
  section.appendChild(duplicateInfo);

  const exportProgress = document.createElement("div");
  exportProgress.className = "preview-export-progress prefab-assembly-export d-none";
  const exportHead = document.createElement("div");
  exportHead.className = "preview-export-progress-head";
  const exportLabel = document.createElement("span");
  exportLabel.textContent = I18n.t("view.prefabAssemblyExportIdle");
  const exportValue = document.createElement("span");
  exportValue.textContent = "0%";
  exportHead.appendChild(exportLabel);
  exportHead.appendChild(exportValue);
  const exportTrack = document.createElement("div");
  exportTrack.className = "progress preview-export-progress-track";
  const exportBar = document.createElement("div");
  exportBar.className = "progress-bar";
  exportBar.setAttribute("role", "progressbar");
  exportBar.style.width = "0%";
  exportBar.setAttribute("aria-valuemin", "0");
  exportBar.setAttribute("aria-valuemax", "100");
  exportBar.setAttribute("aria-valuenow", "0");
  exportTrack.appendChild(exportBar);
  exportProgress.appendChild(exportHead);
  exportProgress.appendChild(exportTrack);
  section.appendChild(exportProgress);

  const components = Array.isArray(assembly?.components)
    ? assembly.components.filter((item) => item && (item.label || rootLabel))
    : [];
  const dependencyList = Array.isArray(dependencies) ? dependencies : [];
  const textureCandidates = Array.isArray(assembly?.textureCandidates)
    ? assembly.textureCandidates.filter((item) => item && item.label)
    : [];
  const missingTextureDeps = Array.isArray(assembly?.missingTextureDependencies)
    ? assembly.missingTextureDependencies.filter((item) => item)
    : [];
  const pendingTextureDeps = Array.isArray(assembly?.pendingTextureDependencies)
    ? assembly.pendingTextureDependencies.filter((item) => item && item.label)
    : [];
  let pending = Array.isArray(assembly?.pendingDependencies)
    ? assembly.pendingDependencies.filter((item) => item && item.label)
    : [];
  let layoutPrefs = loadPrefabAssemblyLayoutPrefs();
  let layoutNode = null;
  let listNode = null;

  const setTextureMappingStatus = (text = "", tone = "neutral") => {
    if (!text) {
      textureMappingStatus.classList.add("d-none");
      textureMappingStatus.classList.remove("is-error", "is-success", "is-warning");
      textureMappingStatus.textContent = "";
      return;
    }
    textureMappingStatus.classList.remove("d-none");
    textureMappingStatus.classList.toggle("is-error", tone === "error");
    textureMappingStatus.classList.toggle("is-success", tone === "success");
    textureMappingStatus.classList.toggle("is-warning", tone === "warning");
    textureMappingStatus.textContent = text;
  };

  const applyLayoutPrefsToNodes = () => {
    if (layoutNode) {
      layoutNode.style.setProperty(
        "--prefab-assembly-list-width",
        `${layoutPrefs.listWidth}px`
      );
    }
    if (listNode) {
      listNode.style.setProperty(
        "--prefab-assembly-list-height",
        `${layoutPrefs.listHeight}px`
      );
      if (layoutPrefs.listColumns === "auto") {
        listNode.style.gridTemplateColumns = "repeat(auto-fill, minmax(186px, 1fr))";
      } else {
        listNode.style.gridTemplateColumns = `repeat(${layoutPrefs.listColumns}, minmax(0, 1fr))`;
      }
    }
  };

  const refreshLayoutControlText = () => {
    layoutWidthText.textContent = I18n.t("view.prefabAssemblyLayoutWidth", {
      value: String(layoutPrefs.listWidth),
    });
    layoutHeightText.textContent = I18n.t("view.prefabAssemblyLayoutHeight", {
      value: String(layoutPrefs.listHeight),
    });
    layoutWidthInput.value = String(layoutPrefs.listWidth);
    layoutHeightInput.value = String(layoutPrefs.listHeight);
    layoutColumnsSelect.value = layoutPrefs.listColumns;
  };
  refreshLayoutControlText();

  const setAssemblyExportProgress = ({ visible, percent, text, state }) => {
    if (!visible) {
      exportProgress.classList.add("d-none");
      exportProgress.classList.remove("is-error", "is-success");
      exportLabel.textContent = I18n.t("view.prefabAssemblyExportIdle");
      exportValue.textContent = "0%";
      exportBar.style.width = "0%";
      exportBar.setAttribute("aria-valuenow", "0");
      return;
    }
    const safe = clampPercent(percent);
    exportProgress.classList.remove("d-none");
    exportProgress.classList.toggle("is-error", state === "error");
    exportProgress.classList.toggle("is-success", state === "success");
    exportLabel.textContent = text || I18n.t("view.prefabAssemblyExportIdle");
    exportValue.textContent = `${Math.round(safe)}%`;
    exportBar.style.width = `${safe}%`;
    exportBar.setAttribute("aria-valuenow", String(Math.round(safe)));
  };

  const refreshPendingControls = () => {
    if (pending.length) {
      prepareButton.classList.remove("d-none");
      prepareButton.disabled = false;
      prepareButton.textContent = I18n.t("view.prefabAssemblyPrepareButton", {
        count: String(pending.length),
      });
      pendingHint.classList.remove("d-none");
      pendingHint.textContent = I18n.t("view.prefabAssemblyPending", {
        count: String(pending.length),
      });
      return;
    }
    prepareButton.classList.add("d-none");
    pendingHint.classList.add("d-none");
  };
  refreshPendingControls();

  const persistLayoutPrefs = () => {
    layoutPrefs = normalizePrefabAssemblyLayoutPrefs(layoutPrefs);
    savePrefabAssemblyLayoutPrefs(layoutPrefs);
    refreshLayoutControlText();
    applyLayoutPrefsToNodes();
  };

  layoutWidthInput.oninput = () => {
    layoutPrefs.listWidth = Math.round(
      clampNumber(layoutWidthInput.value, 260, 840, layoutPrefs.listWidth)
    );
    refreshLayoutControlText();
    applyLayoutPrefsToNodes();
  };
  layoutWidthInput.onchange = persistLayoutPrefs;

  layoutHeightInput.oninput = () => {
    layoutPrefs.listHeight = Math.round(
      clampNumber(layoutHeightInput.value, 180, 920, layoutPrefs.listHeight)
    );
    refreshLayoutControlText();
    applyLayoutPrefsToNodes();
  };
  layoutHeightInput.onchange = persistLayoutPrefs;

  layoutColumnsSelect.onchange = () => {
    layoutPrefs.listColumns = String(layoutColumnsSelect.value || "auto");
    persistLayoutPrefs();
  };

  if (!pending.length && dependencyList.length) {
    pendingHint.classList.remove("d-none");
    pendingHint.textContent = I18n.t("view.prefabAssemblyPendingDetecting");
    inferPrefabPendingDependencies(dependencyList).then((items) => {
      if (!Array.isArray(items) || !items.length) {
        pendingHint.classList.add("d-none");
        return;
      }
      pending = items;
      refreshPendingControls();
    });
  }

  if (textureCandidates.length || missingTextureDeps.length || pendingTextureDeps.length) {
    const textureHint = document.createElement("div");
    textureHint.className = "prefab-assembly-texture";
    const lines = [];
    if (textureCandidates.length) {
      lines.push(
        I18n.t("view.prefabAssemblyTextureHint", {
          count: String(textureCandidates.length),
        })
      );
    }
    if (missingTextureDeps.length) {
      lines.push(
        I18n.t("view.prefabAssemblyTextureMissing", {
          count: String(missingTextureDeps.length),
        })
      );
    }
    if (pendingTextureDeps.length) {
      lines.push(
        I18n.t("view.prefabAssemblyTexturePending", {
          count: String(pendingTextureDeps.length),
        })
      );
    }
    textureHint.textContent = lines.join(" ");
    section.appendChild(textureHint);
  }

  let viewport = null;
  let status = null;
  let entries = [];
  if (components.length) {
    const layout = document.createElement("div");
    layout.className = "prefab-assembly-layout";
    layoutNode = layout;

    const viewportShell = document.createElement("div");
    viewportShell.className = "prefab-assembly-viewport-shell";
    viewport = document.createElement("div");
    viewport.className = "prefab-assembly-viewport";
    status = document.createElement("div");
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
    listNode = list;

    const stageHasDependencyComponents =
      stageAssemblyRoot &&
      components.some((component) => String(component?.source || "") !== "self");
    const ownerComponentCountMap = new Map();
    components.forEach((component) => {
      const owner = String(component?.label || rootLabel || "");
      ownerComponentCountMap.set(owner, (ownerComponentCountMap.get(owner) || 0) + 1);
    });
    const orderedComponents = [...components].sort((left, right) => {
      const leftGroup = deriveAssemblyTextureGroupInfo(rootLabel, left);
      const rightGroup = deriveAssemblyTextureGroupInfo(rootLabel, right);
      if (leftGroup.owner !== rightGroup.owner) {
        return leftGroup.owner.localeCompare(rightGroup.owner);
      }
      if (leftGroup.tag !== rightGroup.tag) {
        return leftGroup.tag.localeCompare(rightGroup.tag);
      }
      if (String(left?.source || "") !== String(right?.source || "")) {
        return String(left?.source || "").localeCompare(String(right?.source || ""));
      }
      return String(left?.name || "").localeCompare(String(right?.name || ""));
    });
    const savedTextureOverrides = loadPrefabAssemblyTextureOverrides(rootLabel);
    let lastTextureGroupKey = "";
    entries = orderedComponents.map((component, index) => {
      const owner = String(component?.label || rootLabel || "");
      const baseTextureGroup = deriveAssemblyTextureGroupInfo(rootLabel, component);
      const ownerComponentCount = ownerComponentCountMap.get(owner) || 0;
      const stageAggregate = isStageAggregateComponent(
        rootLabel,
        component,
        ownerComponentCount
      );
      const shouldDisableStageAggregate =
        stageAssemblyRoot &&
        stageAggregate &&
        (String(component?.source || "").toLowerCase() !== "self" ||
          stageHasDependencyComponents);
      const snowVariant = /(^|[_\s-])snow([_\s-]|$)/i.test(
        String(component?.name || "")
      );
      const initiallyEnabled = !(shouldDisableStageAggregate || (stageAssemblyRoot && snowVariant));
      const row = document.createElement("div");
      row.className = "prefab-assembly-item";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = initiallyEnabled;
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
      const textureEntryProbe = {
        label: component.label || rootLabel,
        rootLabel: rootLabel || "",
        name: component.name || "",
        source: component.source || "",
      };
      const autoTextureMatch = selectAssemblyTextureCandidate(
        textureCandidates,
        textureEntryProbe,
        component.name || ""
      );
      const autoTextureLabel = String(
        autoTextureMatch?.candidate?.label || ""
      ).trim();
      const textureGroupKey = autoTextureLabel
        ? `${baseTextureGroup.key}|${autoTextureLabel}`
        : baseTextureGroup.key;
      const textureGroupTag = autoTextureLabel
        ? `${baseTextureGroup.tag} · ${compactAssemblyTextureGroupLabel(
            autoTextureLabel
          )}`
        : baseTextureGroup.tag;
      const groupMeta = document.createElement("div");
      groupMeta.className = "prefab-assembly-meta prefab-assembly-meta-group";
      groupMeta.textContent = `${I18n.t("view.prefabAssemblyTextureGroup")}: ${textureGroupTag}`;
      if (autoTextureLabel) {
        groupMeta.title = autoTextureLabel;
      }
      const textureState = document.createElement("div");
      textureState.className = "prefab-assembly-texture-state";
      textureState.textContent = I18n.t("view.prefabAssemblyTextureStateAuto");
      const textureControlWrap = document.createElement("div");
      textureControlWrap.className = "prefab-assembly-texture-control-wrap";
      const textureSelect = document.createElement("select");
      textureSelect.className = "form-select form-select-sm prefab-assembly-texture-select";
      const autoOption = document.createElement("option");
      autoOption.value = "__auto__";
      autoOption.textContent = I18n.t("view.prefabAssemblyTextureControlAuto");
      textureSelect.appendChild(autoOption);
      const noneOption = document.createElement("option");
      noneOption.value = "__none__";
      noneOption.textContent = I18n.t("view.prefabAssemblyTextureControlNone");
      textureSelect.appendChild(noneOption);
      const manualTextureOptions = buildAssemblyTextureManualOptions(
        textureCandidates,
        textureEntryProbe
      );
      manualTextureOptions.forEach((candidate) => {
        if (!candidate?.label) {
          return;
        }
        const option = document.createElement("option");
        option.value = candidate.label;
        option.textContent = candidate.label;
        textureSelect.appendChild(option);
      });
      const stopToggle = (event) => event.stopPropagation();
      textureSelect.addEventListener("mousedown", stopToggle);
      textureSelect.addEventListener("click", stopToggle);
      textureSelect.addEventListener("keydown", stopToggle);
      textureControlWrap.appendChild(textureSelect);

      copy.appendChild(name);
      copy.appendChild(meta);
      copy.appendChild(groupMeta);
      copy.appendChild(textureControlWrap);
      copy.appendChild(textureState);
      row.appendChild(checkbox);
      row.appendChild(copy);
      row.addEventListener("click", (event) => {
        const target = event.target;
        if (
          target instanceof Element &&
          target.closest("select, option, input, button, a")
        ) {
          return;
        }
        if (checkbox.disabled) {
          return;
        }
        checkbox.checked = !checkbox.checked;
        checkbox.dispatchEvent(new Event("change", { bubbles: true }));
      });
      if (textureGroupKey !== lastTextureGroupKey) {
        const groupHead = document.createElement("div");
        groupHead.className = "prefab-assembly-group";
        groupHead.textContent = `${I18n.t("view.prefabAssemblyTextureGroup")}: ${textureGroupTag}`;
        if (autoTextureLabel) {
          groupHead.title = autoTextureLabel;
        }
        list.appendChild(groupHead);
        lastTextureGroupKey = textureGroupKey;
      }
      list.appendChild(row);

      return {
        label: component.label || rootLabel,
        rootLabel: rootLabel || "",
        itemId: component.itemId || "",
        name: component.name || "",
        type: component.type || "",
        source: component.source || "",
        enabled: initiallyEnabled,
        isStageAggregate: Boolean(stageAggregate),
        textureGroupKey,
        textureGroupTag,
        textureGroupAutoLabel: autoTextureLabel,
        textureOverrideKey: buildPrefabAssemblyTextureOverrideKey(component, rootLabel),
        textureOverrideLabel: "",
        isAutoDuplicate: false,
        duplicateOf: null,
        byteSize: 0,
        geometryStats: null,
        object: null,
        checkbox,
        textureSelect,
        textureStateNode: textureState,
        metaNode: meta,
        row,
      };
    });
    let restoredOverrideCount = 0;
    let missingSavedOverrideCount = 0;
    entries.forEach((entry) => {
      const saved = String(
        savedTextureOverrides?.[entry.textureOverrideKey] || ""
      ).trim();
      if (!saved || !entry.textureSelect) {
        return;
      }
      if (saved === "__none__") {
        entry.textureSelect.value = "__none__";
        entry.textureOverrideLabel = "__none__";
        restoredOverrideCount += 1;
        return;
      }
      const hasSavedOption = Array.from(entry.textureSelect.options || []).some(
        (option) => option?.value === saved
      );
      if (hasSavedOption) {
        entry.textureSelect.value = saved;
        entry.textureOverrideLabel = saved;
        restoredOverrideCount += 1;
        return;
      }
      entry.textureSelect.value = "__none__";
      entry.textureOverrideLabel = "__none__";
      missingSavedOverrideCount += 1;
    });
    if (restoredOverrideCount && missingSavedOverrideCount) {
      setTextureMappingStatus(
        I18n.t("view.prefabAssemblyMappingLoadedWithMissing", {
          count: String(restoredOverrideCount),
          missing: String(missingSavedOverrideCount),
        }),
        "warning"
      );
    } else if (restoredOverrideCount) {
      setTextureMappingStatus(
        I18n.t("view.prefabAssemblyMappingLoaded", {
          count: String(restoredOverrideCount),
        }),
        "success"
      );
    } else if (missingSavedOverrideCount) {
      setTextureMappingStatus(
        I18n.t("view.prefabAssemblyMappingLoadedMissingOnly", {
          count: String(missingSavedOverrideCount),
        }),
        "warning"
      );
    }
    layout.appendChild(list);
    section.appendChild(layout);
    applyLayoutPrefsToNodes();
    saveTextureMappingButton.disabled = false;
    clearTextureMappingButton.disabled = false;
  } else {
    const empty = document.createElement("div");
    empty.className = "prefab-empty";
    empty.textContent = I18n.t("view.prefabAssemblyNoComponents");
    section.appendChild(empty);
    exportButton.disabled = true;
    exportButton.classList.add("d-none");
    layoutWidthControl.classList.add("d-none");
    layoutHeightControl.classList.add("d-none");
    layoutColumnsControl.classList.add("d-none");
    saveTextureMappingButton.disabled = true;
    clearTextureMappingButton.disabled = true;
    rigInfo.textContent = I18n.t("view.prefabRigNone");
  }

  let viewerApi = null;
  let preparingPending = false;
  const collectManualTextureOverrides = () => {
    const mapping = {};
    entries.forEach((entry) => {
      if (!entry?.textureOverrideKey || !entry.textureSelect) {
        return;
      }
      const value = String(entry.textureSelect.value || "").trim();
      if (!value || value === "__auto__") {
        return;
      }
      mapping[entry.textureOverrideKey] = value;
    });
    return mapping;
  };
  const setEntryTextureOverride = (entry, value, triggerChange = true) => {
    if (!entry?.textureSelect) {
      return false;
    }
    const normalized = String(value || "").trim();
    let target = "__auto__";
    if (normalized === "__none__") {
      target = "__none__";
    } else if (normalized) {
      const hasOption = Array.from(entry.textureSelect.options || []).some(
        (option) => option?.value === normalized
      );
      if (!hasOption) {
        return false;
      }
      target = normalized;
    }
    entry.textureSelect.value = target;
    entry.textureOverrideLabel = target === "__auto__" ? "" : target;
    if (triggerChange && typeof entry.textureSelect.onchange === "function") {
      entry.textureSelect.dispatchEvent(new Event("change", { bubbles: true }));
    }
    return true;
  };
  const markTextureMappingDirty = () => {
    if (!entries.length) {
      return;
    }
    setTextureMappingStatus(I18n.t("view.prefabAssemblyMappingDirty"), "warning");
  };
  const updateDuplicateInfo = ({ enabled, count, show }) => {
    if (!enabled || !count) {
      duplicateInfo.classList.add("d-none");
      return;
    }
    duplicateInfo.classList.remove("d-none");
    duplicateInfo.textContent = show
      ? I18n.t("view.prefabAssemblyDuplicateBySizeShown", {
          count: String(count),
        })
      : I18n.t("view.prefabAssemblyDuplicateBySize", {
          count: String(count),
        });
  };

  saveTextureMappingButton.onclick = () => {
    if (!entries.length) {
      return;
    }
    const mapping = collectManualTextureOverrides();
    const ok = savePrefabAssemblyTextureOverrides(rootLabel, mapping);
    if (!ok) {
      setTextureMappingStatus(I18n.t("view.prefabAssemblyMappingSaveFailed"), "error");
      return;
    }
    setTextureMappingStatus(
      I18n.t("view.prefabAssemblyMappingSaved", {
        count: String(Object.keys(mapping).length),
      }),
      "success"
    );
  };

  clearTextureMappingButton.onclick = () => {
    if (!entries.length) {
      return;
    }
    const ok = clearPrefabAssemblyTextureOverrides(rootLabel);
    entries.forEach((entry) => {
      setEntryTextureOverride(entry, "__auto__", true);
    });
    if (!ok) {
      setTextureMappingStatus(I18n.t("view.prefabAssemblyMappingClearFailed"), "error");
      return;
    }
    setTextureMappingStatus(I18n.t("view.prefabAssemblyMappingCleared"), "success");
  };

  duplicateToggleInput.onchange = () => {
    if (!viewerApi || typeof viewerApi.setShowAutoDuplicates !== "function") {
      return;
    }
    viewerApi.setShowAutoDuplicates(duplicateToggleInput.checked);
  };

  prepareButton.onclick = async () => {
    if (preparingPending || !pending.length) {
      return;
    }
    preparingPending = true;
    prepareButton.disabled = true;
    exportButton.disabled = true;
    let failed = 0;

    try {
      for (let index = 0; index < pending.length; index += 1) {
        const item = pending[index];
        const depLabel = String(item?.label || "").trim();
        if (!depLabel) {
          failed += 1;
          continue;
        }
        setAssemblyExportProgress({
          visible: true,
          percent: (index / pending.length) * 100,
          text: I18n.t("view.prefabAssemblyPreparing", {
            index: String(index + 1),
            total: String(pending.length),
            label: depLabel,
          }),
          state: "running",
        });

        try {
          const response = await fetch(
            `/api/entry/preview/export?label=${encodeURIComponent(depLabel)}&force=0`,
            {
              method: "POST",
              headers: { "Accept": "application/json" },
            }
          );
          if (!response.ok) {
            throw new Error((await response.text()).trim() || I18n.t("view.exportFailed"));
          }
          const payload = await response.json();
          const taskId = payload?.task?.id;
          if (!taskId) {
            throw new Error(I18n.t("view.prefabAssemblyPrepareNoTask"));
          }
          await pollPreviewExportTaskSnapshot(taskId, (task) => {
            const safe = clampPercent(task.percent);
            const overall = ((index + safe / 100) / pending.length) * 100;
            const status = String(task.status || "running").toLowerCase();
            const phaseText = exportPhaseText(task.phase, task.message);
            setAssemblyExportProgress({
              visible: true,
              percent: overall,
              text: `${I18n.t("view.prefabAssemblyPreparing", {
                index: String(index + 1),
                total: String(pending.length),
                label: depLabel,
              })} · ${phaseText}`,
              state: status,
            });
          });
        } catch (err) {
          failed += 1;
        }
      }
    } finally {
      preparingPending = false;
    }

    if (failed > 0) {
      setAssemblyExportProgress({
        visible: true,
        percent: 100,
        text: I18n.t("view.prefabAssemblyPrepareFailed", { count: String(failed) }),
        state: "error",
      });
      pendingHint.classList.remove("d-none");
      pendingHint.textContent = I18n.t("view.prefabAssemblyPrepareFailed", {
        count: String(failed),
      });
      prepareButton.disabled = false;
      exportButton.disabled = !viewerApi;
      return;
    }

    setAssemblyExportProgress({
      visible: true,
      percent: 100,
      text: I18n.t("view.prefabAssemblyPrepareDone"),
      state: "success",
    });
    pendingHint.classList.add("d-none");
    await wait(180);
    await loadEntry();
  };

  exportButton.onclick = async () => {
    if (!viewerApi || typeof viewerApi.exportAsGlb !== "function") {
      return;
    }
    exportButton.disabled = true;
    if (pending.length) {
      prepareButton.disabled = true;
    }
    setAssemblyExportProgress({
      visible: true,
      percent: 1,
      text: I18n.t("view.prefabAssemblyExportPrepare"),
      state: "running",
    });
    try {
      const output = await viewerApi.exportAsGlb((state) => {
        setAssemblyExportProgress({
          visible: true,
          percent: state.percent,
          text: assemblyExportProgressText(state.phase),
          state: state.state,
        });
      });
      triggerBlobDownload(output.blob, output.filename);
      setAssemblyExportProgress({
        visible: true,
        percent: 100,
        text: I18n.t("view.prefabAssemblyExportDone"),
        state: "success",
      });
    } catch (err) {
      setAssemblyExportProgress({
        visible: true,
        percent: 100,
        text: err?.message || I18n.t("view.prefabAssemblyExportFailed"),
        state: "error",
      });
    } finally {
      exportButton.disabled = false;
      if (pending.length && !preparingPending) {
        prepareButton.disabled = false;
      }
    }
  };

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

  if (components.length && viewport && status) {
    addPreviewDisposer(
      mountPrefabAssemblyViewer(viewport, status, entries, rootLabel, {
        textureCandidates,
        onReady(api) {
          viewerApi = api;
          exportButton.disabled = false;
          duplicateToggleInput.disabled = !sizeDedupEnabled;
          if (sizeDedupEnabled && typeof viewerApi.setShowAutoDuplicates === "function") {
            viewerApi.setShowAutoDuplicates(duplicateToggleInput.checked);
          }
        },
        onRigUpdate(info) {
          if (!info?.available) {
            rigInfo.textContent = I18n.t("view.prefabRigNone");
            return;
          }
          const payload = {
            skeletons: String(info.skeletonCount || 0),
            bones: String(info.totalBones || 0),
            mapped: String(info.mappedJointCount || 0),
          };
          rigInfo.textContent = info.humanoid
            ? I18n.t("view.prefabRigHumanoid", payload)
            : I18n.t("view.prefabRigGeneric", payload);
        },
        onDuplicateUpdate(payload) {
          updateDuplicateInfo(payload || { enabled: false, count: 0, show: false });
        },
        onTextureOverrideChange() {
          markTextureMappingDirty();
        },
      })
    );
  }
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

function buildPrefabHierarchyTreeNode(node) {
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
    const childNode = buildPrefabHierarchyTreeNode(child);
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
    const nodeEl = buildPrefabHierarchyTreeNode(rootNode);
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
  const hasAssembly = Boolean(meta.assembly && meta.assembly.available);

  const stage = document.createElement("div");
  stage.className = "prefab-stage";
  const primaryBlock = document.createElement("div");
  primaryBlock.className = "prefab-primary-block";
  stage.appendChild(primaryBlock);
  const media = document.createElement("div");
  media.className = "prefab-media";
  primaryBlock.appendChild(media);

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
  let primaryRendered = false;
  const mediaTitle = document.createElement("div");
  mediaTitle.className = "prefab-media-title";
  primaryBlock.appendChild(mediaTitle);

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
  const ensurePrimaryRendered = () => {
    if (primaryRendered) {
      return;
    }
    renderActiveItem();
    primaryRendered = true;
  };
  if (!hasAssembly) {
    ensurePrimaryRendered();
  }

  let switcher = null;
  if (items.length > 1) {
    switcher = document.createElement("div");
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
        ensurePrimaryRendered();
        renderActiveItem();
      };
      switcher.appendChild(button);
    });
    primaryBlock.appendChild(switcher);
  }

  if (hasAssembly) {
    primaryBlock.classList.add("d-none");
    const togglePrimaryButton = document.createElement("button");
    togglePrimaryButton.type = "button";
    togglePrimaryButton.className = "btn btn-outline-dark btn-sm prefab-primary-toggle";
    const syncPrimaryToggleLabel = () => {
      const hidden = primaryBlock.classList.contains("d-none");
      togglePrimaryButton.textContent = hidden
        ? I18n.t("view.prefabPrimaryShow")
        : I18n.t("view.prefabPrimaryHide");
    };
    togglePrimaryButton.onclick = () => {
      const hidden = primaryBlock.classList.contains("d-none");
      primaryBlock.classList.toggle("d-none", !hidden);
      if (hidden) {
        ensurePrimaryRendered();
      }
      syncPrimaryToggleLabel();
    };
    syncPrimaryToggleLabel();
    stage.appendChild(togglePrimaryButton);

    stage.appendChild(
      createPrefabAssemblySection(meta.assembly, label, meta.dependencies || [])
    );
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
