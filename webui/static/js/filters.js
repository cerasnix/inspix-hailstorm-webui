window.FilterConfig = {
  media: [
    {
      key: "image",
      labelKey: "filters.media.image",
      tokens: [
        "png",
        "jpg",
        "jpeg",
        "webp",
        "bmp",
        "tga",
        "dds",
        "ktx",
        "ktx2",
        "sprite",
        "spriteatlas",
        "texture2d",
        "image",
      ],
      patterns: [
        /^image_/i,
        /^icon_/i,
        /^spriteasset_/i,
        /^ui_/i,
        /^launcher_/i,
      ],
    },
    {
      key: "video",
      labelKey: "filters.media.video",
      tokens: ["usm", "mp4", "webm", "mov", "video"],
      patterns: [/\.usm$/i, /^music_lyric_video_/i, /^picture_/i],
    },
    {
      key: "audio",
      labelKey: "filters.media.audio",
      tokens: ["acb", "awb", "hca", "wav", "ogg", "mp3", "audio"],
      patterns: [/^bgm_/i, /^vo_/i, /^se_/i, /^music_/i, /\.acb$/i, /\.awb$/i],
    },
    {
      key: "model",
      labelKey: "filters.media.model",
      tokens: [
        "prefab",
        "fbx",
        "mesh",
        "material",
        "model",
        "avatar",
        "animationclip",
      ],
      patterns: [/^3d_/i, /^ingame_/i, /\.playable\.assetbundle$/i],
    },
    {
      key: "motion",
      labelKey: "filters.media.motion",
      tokens: ["anim", "animation", "animatorcontroller", "controller", "motion"],
      patterns: [/^mot_/i, /\.anim\.assetbundle$/i, /\.controller\.assetbundle$/i],
    },
    {
      key: "story",
      labelKey: "filters.media.story",
      tokens: ["story", "scenario", "text", "novel", "dialog", "message"],
      patterns: [/^story_/i, /\.txt$/i, /^quest_/i, /^section_/i],
    },
    {
      key: "chart",
      labelKey: "filters.media.chart",
      tokens: ["musicscore", "rhythmgame", "score", "chart", "csv", "tsv", "bytes"],
      patterns: [/^rhythmgame_/i, /^musicscore_/i, /\.bytes$/i, /\.csv$/i],
    },
  ],
  characters: [
    {
      key: "sachi",
      labelKey: "filters.character.sachi",
      patterns: [/(^|[_-])sachi([_.-]|$)/i],
    },
    {
      key: "kozue",
      labelKey: "filters.character.kozue",
      patterns: [/(^|[_-])kozue([_.-]|$)/i],
    },
    {
      key: "tsuzuri",
      labelKey: "filters.character.tsuzuri",
      patterns: [/(^|[_-])tsuzuri([_.-]|$)/i],
    },
    {
      key: "megumi",
      labelKey: "filters.character.megumi",
      patterns: [/(^|[_-])megumi([_.-]|$)/i],
    },
    {
      key: "kaho",
      labelKey: "filters.character.kaho",
      patterns: [/(^|[_-])kaho([_.-]|$)/i],
    },
    {
      key: "sayaka",
      labelKey: "filters.character.sayaka",
      patterns: [/(^|[_-])sayaka([_.-]|$)/i],
    },
    {
      key: "rurino",
      labelKey: "filters.character.rurino",
      patterns: [/(^|[_-])rurino([_.-]|$)/i],
    },
    {
      key: "ginko",
      labelKey: "filters.character.ginko",
      patterns: [/(^|[_-])ginko([_.-]|$)/i],
    },
    {
      key: "kosuzu",
      labelKey: "filters.character.kosuzu",
      patterns: [/(^|[_-])kosuzu([_.-]|$)/i],
    },
    {
      key: "hime",
      labelKey: "filters.character.hime",
      patterns: [/(^|[_-])hime([_.-]|$)/i],
    },
    {
      key: "ceras",
      labelKey: "filters.character.ceras",
      patterns: [/(^|[_-])ceras([_.-]|$)/i],
    },
    {
      key: "izumi",
      labelKey: "filters.character.izumi",
      patterns: [/(^|[_-])izumi([_.-]|$)/i],
    },
    {
      key: "tsukasa",
      labelKey: "filters.character.tsukasa",
      patterns: [/(^|[_-])tsukasa([_.-]|$)/i],
    },
    {
      key: "hiromi",
      labelKey: "filters.character.hiromi",
      patterns: [/(^|[_-])hiromi([_.-]|$)/i],
    },
  ],
  tags: [
    {
      key: "skill",
      labelKey: "filters.tag.skill",
      tokens: ["skill"],
      patterns: [/(^|[_-])skill([_.-]|$)/i],
    },
    {
      key: "middle",
      labelKey: "filters.tag.middle",
      tokens: ["middle"],
      patterns: [/(^|[_-])middle([_.-]|$)/i],
    },
    {
      key: "full",
      labelKey: "filters.tag.full",
      tokens: ["full"],
      patterns: [/(^|[_-])full([_.-]|$)/i],
    },
    {
      key: "half",
      labelKey: "filters.tag.half",
      tokens: ["half"],
      patterns: [/(^|[_-])half([_.-]|$)/i],
    },
    {
      key: "season",
      labelKey: "filters.tag.season",
      tokens: ["season"],
      patterns: [/(^|[_-])season([_.-]|$)/i],
    },
    {
      key: "adv",
      labelKey: "filters.tag.adv",
      tokens: ["adv"],
      patterns: [/(^|[_-])adv([_.-]|$)/i],
    },
    {
      key: "item",
      label: "item",
      tokens: ["item"],
      patterns: [/(^|[_-])item([_.-]|$)/i],
    },
    {
      key: "get",
      label: "get",
      tokens: ["get"],
      patterns: [/(^|[_-])get([_.-]|$)/i],
    },
    {
      key: "frame",
      label: "frame",
      tokens: ["frame"],
      patterns: [/(^|[_-])frame([_.-]|$)/i],
    },
    {
      key: "specialappeal",
      label: "specialappeal",
      tokens: ["specialappeal"],
      patterns: [/(^|[_-])specialappeal([_.-]|$)/i],
    },
    {
      key: "area",
      label: "area",
      tokens: ["area"],
      patterns: [/(^|[_-])area([_.-]|$)/i],
    },
    {
      key: "laugh",
      label: "laugh",
      tokens: ["laugh"],
      patterns: [/(^|[_-])laugh([_.-]|$)/i],
    },
    {
      key: "col",
      label: "col",
      tokens: ["col"],
      patterns: [/(^|[_-])col([_.-]|$)/i],
    },
    {
      key: "normal",
      label: "normal",
      tokens: ["normal"],
      patterns: [/(^|[_-])normal([_.-]|$)/i],
    },
    {
      key: "smile",
      label: "smile",
      tokens: ["smile"],
      patterns: [/(^|[_-])smile([_.-]|$)/i],
    },
    {
      key: "background",
      label: "background",
      tokens: ["background"],
      patterns: [/(^|[_-])background([_.-]|$)/i],
    },
    {
      key: "wink",
      label: "wink",
      tokens: ["wink"],
      patterns: [/(^|[_-])wink([_.-]|$)/i],
    },
    {
      key: "cool",
      label: "cool",
      tokens: ["cool"],
      patterns: [/(^|[_-])cool([_.-]|$)/i],
    },
    {
      key: "sulk",
      label: "sulk",
      tokens: ["sulk"],
      patterns: [/(^|[_-])sulk([_.-]|$)/i],
    },
    {
      key: "doubt",
      label: "doubt",
      tokens: ["doubt"],
      patterns: [/(^|[_-])doubt([_.-]|$)/i],
    },
    {
      key: "painful",
      label: "painful",
      tokens: ["painful"],
      patterns: [/(^|[_-])painful([_.-]|$)/i],
    },
    {
      key: "angry",
      label: "angry",
      tokens: ["angry"],
      patterns: [/(^|[_-])angry([_.-]|$)/i],
    },
    {
      key: "happy",
      label: "happy",
      tokens: ["happy"],
      patterns: [/(^|[_-])happy([_.-]|$)/i],
    },
    {
      key: "noget",
      label: "noget",
      tokens: ["noget"],
      patterns: [/(^|[_-])noget([_.-]|$)/i],
    },
    {
      key: "sad",
      label: "sad",
      tokens: ["sad"],
      patterns: [/(^|[_-])sad([_.-]|$)/i],
    },
    {
      key: "shout",
      label: "shout",
      tokens: ["shout"],
      patterns: [/(^|[_-])shout([_.-]|$)/i],
    },
    {
      key: "sleepy",
      label: "sleepy",
      tokens: ["sleepy"],
      patterns: [/(^|[_-])sleepy([_.-]|$)/i],
    },
    {
      key: "surprise",
      label: "surprise",
      tokens: ["surprise"],
      patterns: [/(^|[_-])surprise([_.-]|$)/i],
    },
    {
      key: "bitter",
      label: "bitter",
      tokens: ["bitter"],
      patterns: [/(^|[_-])bitter([_.-]|$)/i],
    },
    {
      key: "num",
      label: "num",
      tokens: ["num"],
      patterns: [/(^|[_-])num([_.-]|$)/i],
    },
    {
      key: "panic",
      label: "panic",
      tokens: ["panic"],
      patterns: [/(^|[_-])panic([_.-]|$)/i],
    },
    {
      key: "serious",
      label: "serious",
      tokens: ["serious"],
      patterns: [/(^|[_-])serious([_.-]|$)/i],
    },
    {
      key: "square",
      label: "square",
      tokens: ["square"],
      patterns: [/(^|[_-])square([_.-]|$)/i],
    },
    {
      key: "controlmap",
      label: "controlmap",
      tokens: ["controlmap"],
      patterns: [/(^|[_-])controlmap([_.-]|$)/i],
    },
    {
      key: "motivation",
      label: "motivation",
      tokens: ["motivation"],
      patterns: [/(^|[_-])motivation([_.-]|$)/i],
    },
    {
      key: "logo",
      label: "logo",
      tokens: ["logo"],
      patterns: [/(^|[_-])logo([_.-]|$)/i],
    },
    {
      key: "sell",
      label: "sell",
      tokens: ["sell"],
      patterns: [/(^|[_-])sell([_.-]|$)/i],
    },
    {
      key: "standard",
      label: "standard",
      tokens: ["standard"],
      patterns: [/(^|[_-])standard([_.-]|$)/i],
    },
    {
      key: "chara",
      label: "chara",
      tokens: ["chara"],
      patterns: [/(^|[_-])chara([_.-]|$)/i],
    },
    {
      key: "stand",
      label: "stand",
      tokens: ["stand"],
      patterns: [/(^|[_-])stand([_.-]|$)/i],
    },
    {
      key: "shock",
      label: "shock",
      tokens: ["shock"],
      patterns: [/(^|[_-])shock([_.-]|$)/i],
    },
    {
      key: "view",
      label: "view",
      tokens: ["view"],
      patterns: [/(^|[_-])view([_.-]|$)/i],
    },
    {
      key: "download",
      label: "download",
      tokens: ["download"],
      patterns: [/(^|[_-])download([_.-]|$)/i],
    },
    {
      key: "surprised",
      label: "surprised",
      tokens: ["surprised"],
      patterns: [/(^|[_-])surprised([_.-]|$)/i],
    },
    {
      key: "top",
      label: "top",
      tokens: ["top"],
      patterns: [/(^|[_-])top([_.-]|$)/i],
    },
    {
      key: "trouble",
      label: "trouble",
      tokens: ["trouble"],
      patterns: [/(^|[_-])trouble([_.-]|$)/i],
    },
  ],
};

window.FilterUtils = {
  _loadPromise: null,

  tokenizeLabel(label) {
    const tokens = new Set();
    const parts = label
      .toLowerCase()
      .split(/[^a-z0-9]+/g)
      .filter(Boolean);
    parts.forEach((part) => {
      tokens.add(part);
      const trimmed = part.replace(/\d+$/, "");
      if (trimmed && trimmed !== part) {
        tokens.add(trimmed);
      }
    });
    return Array.from(tokens);
  },

  matchLabel(label, filter, tokens) {
    if (!filter) {
      return true;
    }
    let matched = false;
    if (filter.patterns && filter.patterns.length > 0) {
      matched = filter.patterns.some((pattern) => pattern.test(label));
    }
    if (!matched && filter.tokens && filter.tokens.length > 0) {
      const haystack = tokens || FilterUtils.tokenizeLabel(label);
      matched = filter.tokens.some((token) => haystack.includes(token));
    }
    if (!filter.patterns && !filter.tokens) {
      return true;
    }
    return matched;
  },

  loadConfig() {
    if (this._loadPromise) {
      return this._loadPromise;
    }
    this._loadPromise = fetch("/api/filters")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) {
          FilterUtils.mergeConfig(data);
        }
      })
      .catch(() => {});
    return this._loadPromise;
  },

  mergeConfig(data) {
    if (!data || !window.FilterConfig) {
      return;
    }
    if (data.media && FilterConfig.media) {
      Object.keys(data.media).forEach((key) => {
        const filter = FilterConfig.media.find((item) => item.key === key);
        if (!filter) {
          return;
        }
        const tokens = Array.isArray(data.media[key]) ? data.media[key] : [];
        filter.tokens = mergeTokens(filter.tokens, tokens);
      });
    }
    if (Array.isArray(data.characters) && FilterConfig.characters) {
      const existing = new Map();
      FilterConfig.characters.forEach((item) => {
        existing.set(item.key, item);
      });
      data.characters.forEach((token) => {
        const key = String(token || "").toLowerCase();
        if (!key) {
          return;
        }
        const entry = existing.get(key);
        if (entry) {
          entry.tokens = mergeTokens(entry.tokens, [key]);
          return;
        }
        const label = String(token);
        const newFilter = {
          key,
          label,
          tokens: [key],
        };
        FilterConfig.characters.push(newFilter);
        existing.set(key, newFilter);
      });
    }
  },
};

function mergeTokens(base, extra) {
  const set = new Set(Array.isArray(base) ? base : []);
  (Array.isArray(extra) ? extra : []).forEach((token) => {
    if (!token) {
      return;
    }
    set.add(String(token).toLowerCase());
  });
  return Array.from(set);
}
