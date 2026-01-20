window.FilterConfig = {
  media: [
    {
      key: "image",
      labelKey: "filters.media.image",
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
      patterns: [/\.usm$/i, /^music_lyric_video_/i, /^picture_/i],
    },
    {
      key: "audio",
      labelKey: "filters.media.audio",
      patterns: [/^bgm_/i, /^vo_/i, /^se_/i, /^music_/i, /\.acb$/i, /\.awb$/i],
    },
    {
      key: "model",
      labelKey: "filters.media.model",
      patterns: [/^3d_/i, /^ingame_/i, /\.playable\.assetbundle$/i],
    },
    {
      key: "motion",
      labelKey: "filters.media.motion",
      patterns: [/^mot_/i, /\.anim\.assetbundle$/i, /\.controller\.assetbundle$/i],
    },
    {
      key: "story",
      labelKey: "filters.media.story",
      patterns: [/^story_/i, /\.txt$/i, /^quest_/i, /^section_/i],
    },
    {
      key: "chart",
      labelKey: "filters.media.chart",
      patterns: [/^rhythmgame_/i, /^musicscore_/i, /\.bytes$/i, /\.csv$/i],
    },
  ],
  characters: [
    {
      key: "kaho",
      label: "Kaho",
      patterns: [/(^|[_-])kaho([_.-]|$)/i],
    },
    {
      key: "sayaka",
      label: "Sayaka",
      patterns: [/(^|[_-])sayaka([_.-]|$)/i],
    },
    {
      key: "tsuzuri",
      label: "Tsuzuri",
      patterns: [/(^|[_-])tsuzuri([_.-]|$)/i],
    },
    {
      key: "megumi",
      label: "Megumi",
      patterns: [/(^|[_-])megumi([_.-]|$)/i],
    },
    {
      key: "ginko",
      label: "Ginko",
      patterns: [/(^|[_-])ginko([_.-]|$)/i],
    },
    {
      key: "rurino",
      label: "Rurino",
      patterns: [/(^|[_-])rurino([_.-]|$)/i],
    },
    {
      key: "kozue",
      label: "Kozue",
      patterns: [/(^|[_-])kozue([_.-]|$)/i],
    },
    {
      key: "hime",
      label: "Hime",
      patterns: [/(^|[_-])hime([_.-]|$)/i],
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
