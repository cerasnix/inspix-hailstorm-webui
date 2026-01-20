package webui

import (
	"fmt"
	"os"
	"path/filepath"

	"vertesan/hailstorm/manifest"
	"vertesan/hailstorm/runner"
)

func plainAssetPath(entry manifest.Entry) string {
	suffix := ""
	if entry.ResourceType == 1 {
		suffix = ".assetbundle"
	}
	return filepath.Join(runner.DecryptedAssetsSaveDir, entry.StrLabelCrc+suffix)
}

func rawAssetPath(entry manifest.Entry) (string, bool) {
	direct := filepath.Join(runner.AssetsSaveDir, entry.RealName)
	if fileExists(direct) {
		return direct, true
	}

	resType := "raw"
	if entry.ResourceType <= 1 {
		resType = "android"
	}
	if len(entry.RealName) < 2 {
		return "", false
	}
	nested := filepath.Join(runner.AssetsSaveDir, resType, entry.RealName[:2], entry.RealName)
	if fileExists(nested) {
		return nested, true
	}

	return "", false
}

func assetDisplayName(entry manifest.Entry) string {
	suffix := ""
	if entry.ResourceType == 1 {
		suffix = ".assetbundle"
	}
	return fmt.Sprintf("%s%s", entry.StrLabelCrc, suffix)
}

func fileExists(path string) bool {
	info, err := os.Stat(path)
	if err != nil {
		return false
	}
	return !info.IsDir()
}
