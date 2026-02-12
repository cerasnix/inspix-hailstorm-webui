package runner

import (
	"io"
	"os"
	"path/filepath"
	"strings"

	"vertesan/hailstorm/manifest"
	"vertesan/hailstorm/utils"
)

const (
	CatalogVersionHistoryDir = "cache/version-history"
	versionCatalogFileName   = "catalog.json"
	versionMarkerFileName    = "version.txt"
)

func snapshotCatalogForVersion(version string, sourcePath string) error {
	version = strings.TrimSpace(version)
	if version == "" || !fileExists(sourcePath) {
		return nil
	}

	dir := filepath.Join(CatalogVersionHistoryDir, sanitizeVersionForPath(version))
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}

	if err := copyFile(sourcePath, filepath.Join(dir, versionCatalogFileName)); err != nil {
		return err
	}

	return os.WriteFile(filepath.Join(dir, versionMarkerFileName), []byte(version), 0o644)
}

func writeCatalogSnapshotForVersion(version string, entries []manifest.Entry) error {
	version = strings.TrimSpace(version)
	if version == "" {
		return nil
	}
	dir := filepath.Join(CatalogVersionHistoryDir, sanitizeVersionForPath(version))
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}

	utils.WriteToJsonFile(entries, filepath.Join(dir, versionCatalogFileName))
	return os.WriteFile(filepath.Join(dir, versionMarkerFileName), []byte(version), 0o644)
}

func versionSnapshotExists(version string) bool {
	version = strings.TrimSpace(version)
	if version == "" {
		return false
	}
	path := filepath.Join(
		CatalogVersionHistoryDir,
		sanitizeVersionForPath(version),
		versionCatalogFileName,
	)
	return fileExists(path)
}

func sanitizeVersionForPath(version string) string {
	var b strings.Builder
	for _, r := range version {
		switch {
		case r >= 'a' && r <= 'z':
			b.WriteRune(r)
		case r >= 'A' && r <= 'Z':
			b.WriteRune(r)
		case r >= '0' && r <= '9':
			b.WriteRune(r)
		case r == '.', r == '-', r == '_':
			b.WriteRune(r)
		default:
			b.WriteByte('_')
		}
	}
	sanitized := strings.Trim(b.String(), "._-")
	if sanitized == "" {
		return "unknown"
	}
	return sanitized
}

func copyFile(src string, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()

	out, err := os.Create(dst)
	if err != nil {
		return err
	}

	if _, err := io.Copy(out, in); err != nil {
		_ = out.Close()
		return err
	}
	return out.Close()
}

func fileExists(path string) bool {
	info, err := os.Stat(path)
	if err != nil {
		return false
	}
	return !info.IsDir()
}
