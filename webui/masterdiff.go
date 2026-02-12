package webui

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	"vertesan/hailstorm/manifest"
	"vertesan/hailstorm/runner"
	"vertesan/hailstorm/utils"
)

const (
	versionSnapshotCatalogFile = "catalog.json"
	versionSnapshotMarkerFile  = "version.txt"
	defaultMasterDiffLimit     = 5000
	maxMasterDiffLimit         = 20000
	maxLookupLabels            = 500
)

var (
	errVersionNotFound  = errors.New("version not found")
	errLoadSourceFailed = errors.New("failed to load source version catalog")
	errLoadTargetFailed = errors.New("failed to load target version catalog")
)

type catalogVersionSnapshot struct {
	Version   string    `json:"version"`
	Source    string    `json:"source"`
	Current   bool      `json:"current"`
	UpdatedAt time.Time `json:"-"`
}

type masterDiffEntry struct {
	Type         string `json:"type"`
	Size         uint64 `json:"size"`
	Checksum     string `json:"checksum"`
	ResourceType uint32 `json:"resourceType"`
	RealName     string `json:"realName"`
}

type masterDiffItem struct {
	Label  string           `json:"label"`
	Status string           `json:"status"`
	From   *masterDiffEntry `json:"from,omitempty"`
	To     *masterDiffEntry `json:"to,omitempty"`
}

func (s *Server) handleMasterVersions(w http.ResponseWriter, r *http.Request) {
	versions, _, current := collectCatalogVersionSources()
	if len(versions) == 0 {
		writeJSON(w, map[string]any{
			"current":  current,
			"versions": []catalogVersionSnapshot{},
		})
		return
	}

	sort.Slice(versions, func(i, j int) bool {
		if versions[i].Current != versions[j].Current {
			return versions[i].Current
		}
		if versions[i].Version != versions[j].Version {
			return versions[i].Version > versions[j].Version
		}
		return versions[i].UpdatedAt.After(versions[j].UpdatedAt)
	})

	writeJSON(w, map[string]any{
		"current":  current,
		"versions": versions,
	})
}

func (s *Server) handleMasterDiff(w http.ResponseWriter, r *http.Request) {
	fromVersion := strings.TrimSpace(r.URL.Query().Get("from"))
	toVersion := strings.TrimSpace(r.URL.Query().Get("to"))
	if fromVersion == "" || toVersion == "" {
		http.Error(w, "missing from/to version", http.StatusBadRequest)
		return
	}
	if fromVersion == toVersion {
		http.Error(w, "from and to must be different versions", http.StatusBadRequest)
		return
	}

	limit := defaultMasterDiffLimit
	if rawLimit := strings.TrimSpace(r.URL.Query().Get("limit")); rawLimit != "" {
		parsed, err := strconv.Atoi(rawLimit)
		if err != nil || parsed <= 0 {
			http.Error(w, "invalid limit", http.StatusBadRequest)
			return
		}
		limit = parsed
	}
	if limit > maxMasterDiffLimit {
		limit = maxMasterDiffLimit
	}

	fromMap, toMap, err := loadCatalogEntryMapsForVersions(fromVersion, toVersion)
	if err != nil {
		writeMasterDiffError(w, err)
		return
	}

	items := make([]masterDiffItem, 0)
	added := 0
	removed := 0
	modified := 0

	for label, toEntry := range toMap {
		fromEntry, ok := fromMap[label]
		if !ok {
			added++
			items = append(items, masterDiffItem{
				Label:  label,
				Status: "added",
				To:     toDiffEntry(toEntry),
			})
			continue
		}
		if !entryChanged(fromEntry, toEntry) {
			continue
		}
		modified++
		items = append(items, masterDiffItem{
			Label:  label,
			Status: "modified",
			From:   toDiffEntry(fromEntry),
			To:     toDiffEntry(toEntry),
		})
	}

	for label, fromEntry := range fromMap {
		if _, ok := toMap[label]; ok {
			continue
		}
		removed++
		items = append(items, masterDiffItem{
			Label:  label,
			Status: "removed",
			From:   toDiffEntry(fromEntry),
		})
	}

	sort.Slice(items, func(i, j int) bool {
		if items[i].Status != items[j].Status {
			return diffStatusOrder(items[i].Status) < diffStatusOrder(items[j].Status)
		}
		return items[i].Label < items[j].Label
	})

	total := len(items)
	truncated := false
	if len(items) > limit {
		truncated = true
		items = items[:limit]
	}

	writeJSON(w, map[string]any{
		"from":      fromVersion,
		"to":        toVersion,
		"limit":     limit,
		"truncated": truncated,
		"total":     total,
		"summary": map[string]int{
			"added":    added,
			"removed":  removed,
			"modified": modified,
			"total":    added + removed + modified,
		},
		"items": items,
	})
}

func (s *Server) handleMasterDiffLookup(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		From   string   `json:"from"`
		To     string   `json:"to"`
		Labels []string `json:"labels"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}

	fromVersion := strings.TrimSpace(req.From)
	toVersion := strings.TrimSpace(req.To)
	if fromVersion == "" || toVersion == "" {
		http.Error(w, "missing from/to version", http.StatusBadRequest)
		return
	}
	if fromVersion == toVersion {
		http.Error(w, "from and to must be different versions", http.StatusBadRequest)
		return
	}

	if len(req.Labels) > maxLookupLabels {
		http.Error(w, "too many labels", http.StatusBadRequest)
		return
	}

	fromMap, toMap, err := loadCatalogEntryMapsForVersions(fromVersion, toVersion)
	if err != nil {
		writeMasterDiffError(w, err)
		return
	}

	seen := make(map[string]struct{}, len(req.Labels))
	items := make(map[string]masterDiffItem, len(req.Labels))
	for _, rawLabel := range req.Labels {
		label := strings.TrimSpace(rawLabel)
		if label == "" {
			continue
		}
		if _, ok := seen[label]; ok {
			continue
		}
		seen[label] = struct{}{}
		items[label] = diffItemForLabel(label, fromMap, toMap)
	}

	writeJSON(w, map[string]any{
		"from":  fromVersion,
		"to":    toVersion,
		"items": items,
	})
}

func collectCatalogVersionSources() ([]catalogVersionSnapshot, map[string]string, string) {
	sources := make(map[string]string)
	snapshots := make([]catalogVersionSnapshot, 0)
	indexByVersion := make(map[string]int)
	currentVersion := readCurrentCatalogVersion()

	dirs, err := os.ReadDir(runner.CatalogVersionHistoryDir)
	if err == nil {
		for _, dir := range dirs {
			if !dir.IsDir() {
				continue
			}
			baseDir := filepath.Join(runner.CatalogVersionHistoryDir, dir.Name())
			catalogPath := filepath.Join(baseDir, versionSnapshotCatalogFile)
			if !fileExists(catalogPath) {
				continue
			}

			version := dir.Name()
			markerPath := filepath.Join(baseDir, versionSnapshotMarkerFile)
			if marker, markerErr := os.ReadFile(markerPath); markerErr == nil {
				trimmed := strings.TrimSpace(string(marker))
				if trimmed != "" {
					version = trimmed
				}
			}

			if strings.TrimSpace(version) == "" {
				continue
			}

			info, statErr := os.Stat(catalogPath)
			if statErr != nil {
				continue
			}

			if idx, exists := indexByVersion[version]; exists {
				if info.ModTime().After(snapshots[idx].UpdatedAt) {
					sources[version] = catalogPath
					snapshots[idx].UpdatedAt = info.ModTime()
				}
				continue
			}

			sources[version] = catalogPath
			indexByVersion[version] = len(snapshots)
			snapshots = append(snapshots, catalogVersionSnapshot{
				Version:   version,
				Source:    "history",
				Current:   false,
				UpdatedAt: info.ModTime(),
			})
		}
	}

	if currentVersion != "" && fileExists(runner.CatalogJsonFile) {
		currentInfo, err := os.Stat(runner.CatalogJsonFile)
		if err == nil {
			sources[currentVersion] = runner.CatalogJsonFile
			if idx, exists := indexByVersion[currentVersion]; exists {
				snapshots[idx].Current = true
				snapshots[idx].Source = "current"
				snapshots[idx].UpdatedAt = currentInfo.ModTime()
			} else {
				indexByVersion[currentVersion] = len(snapshots)
				snapshots = append(snapshots, catalogVersionSnapshot{
					Version:   currentVersion,
					Source:    "current",
					Current:   true,
					UpdatedAt: currentInfo.ModTime(),
				})
			}
		}
	}

	return snapshots, sources, currentVersion
}

func readCurrentCatalogVersion() string {
	data, err := os.ReadFile(runner.CatalogVersionFile)
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(data))
}

func loadCatalogEntries(path string) ([]manifest.Entry, error) {
	entries := []manifest.Entry{}
	if err := utils.ReadFromJsonFile(path, &entries); err != nil {
		return nil, err
	}
	return entries, nil
}

func loadCatalogEntryMapsForVersions(fromVersion string, toVersion string) (map[string]manifest.Entry, map[string]manifest.Entry, error) {
	_, sources, _ := collectCatalogVersionSources()
	fromPath, fromOK := sources[fromVersion]
	toPath, toOK := sources[toVersion]
	if !fromOK || !toOK {
		return nil, nil, errVersionNotFound
	}

	fromEntries, err := loadCatalogEntries(fromPath)
	if err != nil {
		return nil, nil, errLoadSourceFailed
	}
	toEntries, err := loadCatalogEntries(toPath)
	if err != nil {
		return nil, nil, errLoadTargetFailed
	}

	fromMap := make(map[string]manifest.Entry, len(fromEntries))
	for _, entry := range fromEntries {
		fromMap[entry.StrLabelCrc] = entry
	}
	toMap := make(map[string]manifest.Entry, len(toEntries))
	for _, entry := range toEntries {
		toMap[entry.StrLabelCrc] = entry
	}

	return fromMap, toMap, nil
}

func toDiffEntry(entry manifest.Entry) *masterDiffEntry {
	return &masterDiffEntry{
		Type:         entry.StrTypeCrc,
		Size:         entry.Size,
		Checksum:     fmt.Sprintf("%d", entry.Checksum),
		ResourceType: entry.ResourceType,
		RealName:     entry.RealName,
	}
}

func entryChanged(from manifest.Entry, to manifest.Entry) bool {
	if from.Checksum != to.Checksum {
		return true
	}
	if from.Size != to.Size {
		return true
	}
	if from.StrTypeCrc != to.StrTypeCrc {
		return true
	}
	if from.ResourceType != to.ResourceType {
		return true
	}
	return from.RealName != to.RealName
}

func diffStatusOrder(status string) int {
	switch status {
	case "modified":
		return 0
	case "added":
		return 1
	case "removed":
		return 2
	default:
		return 3
	}
}

func diffItemForLabel(label string, fromMap map[string]manifest.Entry, toMap map[string]manifest.Entry) masterDiffItem {
	fromEntry, fromOK := fromMap[label]
	toEntry, toOK := toMap[label]

	switch {
	case fromOK && toOK:
		if entryChanged(fromEntry, toEntry) {
			return masterDiffItem{
				Label:  label,
				Status: "modified",
				From:   toDiffEntry(fromEntry),
				To:     toDiffEntry(toEntry),
			}
		}
		return masterDiffItem{
			Label:  label,
			Status: "unchanged",
			From:   toDiffEntry(fromEntry),
			To:     toDiffEntry(toEntry),
		}
	case !fromOK && toOK:
		return masterDiffItem{
			Label:  label,
			Status: "added",
			To:     toDiffEntry(toEntry),
		}
	case fromOK && !toOK:
		return masterDiffItem{
			Label:  label,
			Status: "removed",
			From:   toDiffEntry(fromEntry),
		}
	default:
		return masterDiffItem{
			Label:  label,
			Status: "missing",
		}
	}
}

func writeMasterDiffError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, errVersionNotFound):
		http.Error(w, errVersionNotFound.Error(), http.StatusNotFound)
	case errors.Is(err, errLoadSourceFailed), errors.Is(err, errLoadTargetFailed):
		http.Error(w, err.Error(), http.StatusInternalServerError)
	default:
		http.Error(w, "master diff failed", http.StatusInternalServerError)
	}
}
