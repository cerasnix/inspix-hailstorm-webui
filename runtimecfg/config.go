package runtimecfg

import (
	"encoding/json"
	"errors"
	"os"
	"strings"
)

const (
	ConfigPathEnv     = "HAILSTORM_RUNTIME_CONFIG"
	DefaultConfigPath = "webui/config/config.json"
)

type VersionPair struct {
	ClientVersion string `json:"clientVersion"`
	ResInfo       string `json:"resInfo"`
}

type Config struct {
	ClientVersion  string        `json:"clientVersion"`
	ResInfo        string        `json:"resInfo"`
	AssetRipperDir string        `json:"assetRipperDir"`
	VersionHistory []VersionPair `json:"versionHistory"`
}

func Path() string {
	if fromEnv := strings.TrimSpace(os.Getenv(ConfigPathEnv)); fromEnv != "" {
		return fromEnv
	}
	return DefaultConfigPath
}

func Load() (*Config, error) {
	path := Path()
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	cfg := &Config{}
	if err := json.Unmarshal(raw, cfg); err != nil {
		return nil, err
	}
	normalizeConfig(cfg)
	return cfg, nil
}

func normalizeConfig(cfg *Config) {
	cfg.ClientVersion = strings.TrimSpace(cfg.ClientVersion)
	cfg.ResInfo = strings.TrimSpace(cfg.ResInfo)
	cfg.AssetRipperDir = strings.TrimSpace(cfg.AssetRipperDir)

	filtered := make([]VersionPair, 0, len(cfg.VersionHistory))
	for _, item := range cfg.VersionHistory {
		client := strings.TrimSpace(item.ClientVersion)
		res := strings.TrimSpace(item.ResInfo)
		if client == "" || res == "" {
			continue
		}
		filtered = append(filtered, VersionPair{
			ClientVersion: client,
			ResInfo:       res,
		})
	}
	cfg.VersionHistory = filtered
}

func ResolvePair(clientVersion string, resInfo string) (string, string, bool, error) {
	clientVersion = strings.TrimSpace(clientVersion)
	resInfo = strings.TrimSpace(resInfo)
	if clientVersion != "" && resInfo != "" {
		return clientVersion, resInfo, false, nil
	}

	cfg, err := Load()
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return clientVersion, resInfo, false, nil
		}
		return clientVersion, resInfo, false, err
	}

	if clientVersion == "" && resInfo == "" {
		if cfg.ClientVersion != "" && cfg.ResInfo != "" {
			return cfg.ClientVersion, cfg.ResInfo, true, nil
		}
		if len(cfg.VersionHistory) > 0 {
			return cfg.VersionHistory[0].ClientVersion, cfg.VersionHistory[0].ResInfo, true, nil
		}
		return clientVersion, resInfo, false, nil
	}

	if clientVersion == "" {
		for _, pair := range cfg.VersionHistory {
			if pair.ResInfo == resInfo {
				return pair.ClientVersion, resInfo, true, nil
			}
		}
		if cfg.ResInfo == resInfo && cfg.ClientVersion != "" {
			return cfg.ClientVersion, resInfo, true, nil
		}
		return clientVersion, resInfo, false, nil
	}

	if resInfo == "" {
		for _, pair := range cfg.VersionHistory {
			if pair.ClientVersion == clientVersion {
				return clientVersion, pair.ResInfo, true, nil
			}
		}
		if cfg.ClientVersion == clientVersion && cfg.ResInfo != "" {
			return clientVersion, cfg.ResInfo, true, nil
		}
		return clientVersion, resInfo, false, nil
	}

	return clientVersion, resInfo, false, nil
}
