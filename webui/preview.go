package webui

import (
	"bufio"
	"bytes"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"
)

const previewRoot = "cache/webui-preview"
const prefabHierarchyMaxNodes = 1200

type PreviewInfo struct {
	Available   bool
	Kind        string
	ContentType string
	Path        string
	Source      string
	OutputDir   string
	Exportable  bool
	Items       []PreviewItem
	Meta        map[string]any
}

type PreviewProgressReporter func(percent float64, phase string, message string)

var loopRE = regexp.MustCompile(`(?i)\bloop (start|end)\b`)
var streamCountRE = regexp.MustCompile(`(?i)(stream count|streams|subsong count|subsongs)\s*:\s*(\d+)`)
var meshVertexCountRE = regexp.MustCompile(`"m_VertexCount"\s*:\s*(\d+)`)
var musicLyricVideoRE = regexp.MustCompile(`(?i)^music_lyric_video_(\d+)\.usm$`)
var trailingNumberBeforeExtRE = regexp.MustCompile(`(?i)(\d+)(?:\.[^.]+)?$`)
var bundleNameLineRE = regexp.MustCompile(`"m_AssetBundleName"\s*:\s*"([^"]*)"`)
var quotedStringLineRE = regexp.MustCompile(`"([^"\\]+)"`)

type PreviewItem struct {
	ID          string
	ContentType string
	Path        string
	Kind        string
	Name        string
}

type PrefabAssetGroup struct {
	Name  string `json:"name"`
	Count int    `json:"count"`
}

type bundleDescriptor struct {
	BundleName   string
	Dependencies []string
}

type prefabHierarchySummary struct {
	Available         bool                  `json:"available"`
	Source            string                `json:"source,omitempty"`
	NodeCount         int                   `json:"nodeCount"`
	RenderedNodeCount int                   `json:"renderedNodeCount"`
	RootCount         int                   `json:"rootCount"`
	MaxDepth          int                   `json:"maxDepth"`
	Truncated         bool                  `json:"truncated"`
	ComponentStats    []prefabComponentStat `json:"componentStats,omitempty"`
	Roots             []prefabHierarchyNode `json:"roots,omitempty"`
	Error             string                `json:"error,omitempty"`
}

type prefabHierarchyNode struct {
	Name       string                `json:"name"`
	Index      int                   `json:"index"`
	Components []string              `json:"components"`
	Children   []prefabHierarchyNode `json:"children,omitempty"`
}

type prefabComponentStat struct {
	Name  string `json:"name"`
	Count int    `json:"count"`
}

type gltfNode struct {
	Name        string    `json:"name"`
	Children    []int     `json:"children"`
	Mesh        *int      `json:"mesh"`
	Camera      *int      `json:"camera"`
	Skin        *int      `json:"skin"`
	Weights     []float64 `json:"weights"`
	Translation []float64 `json:"translation"`
	Rotation    []float64 `json:"rotation"`
	Scale       []float64 `json:"scale"`
}

type gltfScene struct {
	Nodes []int `json:"nodes"`
}

type gltfDocument struct {
	Nodes  []gltfNode  `json:"nodes"`
	Scene  *int        `json:"scene"`
	Scenes []gltfScene `json:"scenes"`
}

func resolvePreview(entryLabel string, entryType string, resourceType uint32, plainPath string) PreviewInfo {
	if direct := sniffDirectPreview(plainPath); direct.Available {
		direct.Path = plainPath
		direct.Source = "plain"
		return direct
	}

	if isUsm(entryLabel) {
		if info := inspectUsmPreview(entryLabel, plainPath); info.Available || info.Exportable {
			return info
		}
	}

	if isAcb(entryLabel) {
		if info := inspectAcbPreview(entryLabel, plainPath); info.Available || info.Exportable {
			return info
		}
	}

	if isAssetBundle(entryLabel, resourceType) {
		return inspectAssetBundlePreview(entryLabel)
	}

	return PreviewInfo{}
}

func sniffDirectPreview(path string) PreviewInfo {
	file, err := os.Open(path)
	if err != nil {
		return PreviewInfo{}
	}
	defer file.Close()

	reader := bufio.NewReader(file)
	buf := make([]byte, 512)
	n, _ := reader.Read(buf)
	if n == 0 {
		return PreviewInfo{}
	}
	buf = buf[:n]

	if kind, ctype := sniffKnown(buf); kind != "" {
		return PreviewInfo{
			Available:   true,
			Kind:        kind,
			ContentType: ctype,
		}
	}

	detected := http.DetectContentType(buf)
	switch {
	case strings.HasPrefix(detected, "image/"):
		return PreviewInfo{Available: true, Kind: "image", ContentType: detected}
	case strings.HasPrefix(detected, "audio/"):
		return PreviewInfo{Available: true, Kind: "audio", ContentType: detected}
	case strings.HasPrefix(detected, "video/"):
		return PreviewInfo{Available: true, Kind: "video", ContentType: detected}
	default:
		return PreviewInfo{}
	}
}

func inspectAcbPreview(label string, plainPath string) PreviewInfo {
	outDir := filepath.Join(previewRoot, "acb")
	toolsOK := acbToolsAvailable()
	if !toolsOK {
		return PreviewInfo{
			OutputDir:  outputDirForClient(outDir),
			Exportable: false,
		}
	}

	if !fileExists(plainPath) {
		return PreviewInfo{
			OutputDir:  outputDirForClient(outDir),
			Exportable: toolsOK,
		}
	}
	base := sanitizeLabel(label)
	outPath := filepath.Join(outDir, base+".mp3")
	if isFresh(outPath, plainPath) {
		return PreviewInfo{
			Available:   true,
			Kind:        "audio",
			ContentType: "audio/mpeg",
			Path:        outPath,
			Source:      "derived",
			OutputDir:   outputDirForClient(outDir),
			Exportable:  toolsOK,
		}
	}

	multi, _ := filepath.Glob(filepath.Join(outDir, base+"_[0-9][0-9].mp3"))
	if len(multi) == 0 {
		return PreviewInfo{
			OutputDir:  outputDirForClient(outDir),
			Exportable: toolsOK,
		}
	}
	sort.Strings(multi)

	items := make([]PreviewItem, 0, len(multi))
	for _, path := range multi {
		if !isFresh(path, plainPath) {
			continue
		}
		baseName := strings.TrimSuffix(filepath.Base(path), filepath.Ext(path))
		parts := strings.Split(baseName, "_")
		id := parts[len(parts)-1]
		items = append(items, PreviewItem{
			ID:          id,
			ContentType: "audio/mpeg",
			Path:        path,
			Name:        fmt.Sprintf("Track %s", id),
		})
	}
	if len(items) == 0 {
		return PreviewInfo{
			OutputDir:  outputDirForClient(outDir),
			Exportable: toolsOK,
		}
	}
	return PreviewInfo{
		Available:   true,
		Kind:        "audio",
		ContentType: "audio/mpeg",
		Path:        items[0].Path,
		Source:      "derived",
		OutputDir:   outputDirForClient(outDir),
		Exportable:  toolsOK,
		Items:       items,
	}
}

func reportPreviewProgress(report PreviewProgressReporter, percent float64, phase string, message string) {
	if report != nil {
		report(percent, phase, message)
	}
}

func ensureAcbPreview(label string, plainPath string) PreviewInfo {
	return ensureAcbPreviewWithProgress(label, plainPath, nil)
}

func ensureAcbPreviewWithProgress(label string, plainPath string, report PreviewProgressReporter) PreviewInfo {
	outDir := filepath.Join(previewRoot, "acb")
	toolsOK := acbToolsAvailable()
	if !toolsOK {
		return PreviewInfo{
			OutputDir:  outputDirForClient(outDir),
			Exportable: false,
		}
	}

	if !fileExists(plainPath) {
		return PreviewInfo{
			OutputDir:  outputDirForClient(outDir),
			Exportable: toolsOK,
		}
	}
	if err := os.MkdirAll(outDir, 0755); err != nil {
		return PreviewInfo{
			OutputDir:  outputDirForClient(outDir),
			Exportable: toolsOK,
		}
	}
	base := sanitizeLabel(label)
	outPath := filepath.Join(outDir, base+".mp3")

	reportPreviewProgress(report, 8, "prepare", "")
	streamCount := detectStreamCount(plainPath)
	reportPreviewProgress(report, 14, "probe", fmt.Sprintf("streams=%d", streamCount))
	if streamCount <= 1 {
		if isFresh(outPath, plainPath) {
			reportPreviewProgress(report, 100, "cached", "")
			return PreviewInfo{
				Available:   true,
				Kind:        "audio",
				ContentType: "audio/mpeg",
				Path:        outPath,
				Source:      "derived",
				OutputDir:   outputDirForClient(outDir),
				Exportable:  toolsOK,
			}
		}

		reportPreviewProgress(report, 28, "decode", "")
		_, ok := encodeAcbToMp3(plainPath, outPath, 0)
		if !ok {
			return PreviewInfo{
				OutputDir:  outputDirForClient(outDir),
				Exportable: toolsOK,
			}
		}
		reportPreviewProgress(report, 94, "finalize", "")
		return PreviewInfo{
			Available:   true,
			Kind:        "audio",
			ContentType: "audio/mpeg",
			Path:        outPath,
			Source:      "derived",
			OutputDir:   outputDirForClient(outDir),
			Exportable:  toolsOK,
		}
	}

	items := []PreviewItem{}
	for i := 1; i <= streamCount; i++ {
		suffix := fmt.Sprintf("%s_%02d.mp3", base, i)
		out := filepath.Join(outDir, suffix)
		start := 16 + (float64(i-1)/float64(streamCount))*74
		end := 16 + (float64(i)/float64(streamCount))*74
		reportPreviewProgress(report, start, "transcode", fmt.Sprintf("track=%d/%d", i, streamCount))

		if !isFresh(out, plainPath) {
			item, ok := encodeAcbToMp3(plainPath, out, i)
			if !ok {
				continue
			}
			item.Name = fmt.Sprintf("Track %02d", i)
			items = append(items, item)
		} else {
			items = append(items, PreviewItem{
				ID:          fmt.Sprintf("%02d", i),
				ContentType: "audio/mpeg",
				Path:        out,
				Name:        fmt.Sprintf("Track %02d", i),
			})
		}
		reportPreviewProgress(report, end, "transcode", fmt.Sprintf("track=%d/%d", i, streamCount))
	}

	if len(items) == 0 {
		return PreviewInfo{
			OutputDir:  outputDirForClient(outDir),
			Exportable: toolsOK,
		}
	}
	reportPreviewProgress(report, 96, "finalize", "")

	return PreviewInfo{
		Available:   true,
		Kind:        "audio",
		ContentType: "audio/mpeg",
		Path:        items[0].Path,
		Source:      "derived",
		OutputDir:   outputDirForClient(outDir),
		Exportable:  toolsOK,
		Items:       items,
	}
}

func inspectUsmPreview(label string, plainPath string) PreviewInfo {
	outDir := filepath.Join(previewRoot, "usm")
	toolsOK := ffmpegAvailable()
	if !toolsOK {
		return PreviewInfo{
			OutputDir:  outputDirForClient(outDir),
			Exportable: false,
		}
	}
	if !fileExists(plainPath) {
		return PreviewInfo{
			OutputDir:  outputDirForClient(outDir),
			Exportable: toolsOK,
		}
	}

	outPath := filepath.Join(outDir, sanitizeLabel(label)+".mp4")
	if !isFresh(outPath, plainPath) {
		return PreviewInfo{
			OutputDir:  outputDirForClient(outDir),
			Exportable: toolsOK,
		}
	}
	return PreviewInfo{
		Available:   true,
		Kind:        "video",
		ContentType: "video/mp4",
		Path:        outPath,
		Source:      "derived",
		OutputDir:   outputDirForClient(outDir),
		Exportable:  toolsOK,
	}
}

func ensureUsmPreview(label string, plainPath string, force bool) PreviewInfo {
	return ensureUsmPreviewWithProgress(label, plainPath, force, nil)
}

func ensureUsmPreviewWithProgress(label string, plainPath string, force bool, report PreviewProgressReporter) PreviewInfo {
	outDir := filepath.Join(previewRoot, "usm")
	toolsOK := ffmpegAvailable()
	if !toolsOK {
		return PreviewInfo{
			OutputDir:  outputDirForClient(outDir),
			Exportable: false,
		}
	}

	if !fileExists(plainPath) {
		return PreviewInfo{
			OutputDir:  outputDirForClient(outDir),
			Exportable: toolsOK,
		}
	}
	if err := os.MkdirAll(outDir, 0755); err != nil {
		return PreviewInfo{
			OutputDir:  outputDirForClient(outDir),
			Exportable: toolsOK,
		}
	}
	reportPreviewProgress(report, 10, "prepare", "")

	companionAcb := findUsmCompanionAcbPath(label, plainPath)
	companionAudio := ""
	if companionAcb != "" {
		reportPreviewProgress(report, 22, "audio", "companion")
		if derivedAudio, ok := ensureAcbAudioForUsm(companionAcb); ok {
			companionAudio = derivedAudio
		}
	}

	outPath := filepath.Join(outDir, sanitizeLabel(label)+".mp4")
	deps := []string{plainPath}
	if companionAcb != "" {
		deps = append(deps, companionAcb)
	}
	if companionAudio != "" {
		deps = append(deps, companionAudio)
	}
	if force || !isFreshForInputs(outPath, deps...) {
		reportPreviewProgress(report, 40, "transcode", "")
		if !transcodeUsmToMp4(plainPath, companionAudio, outPath, report) {
			return PreviewInfo{
				OutputDir:  outputDirForClient(outDir),
				Exportable: toolsOK,
			}
		}
		reportPreviewProgress(report, 96, "finalize", "")
	} else {
		reportPreviewProgress(report, 100, "cached", "")
	}

	return PreviewInfo{
		Available:   true,
		Kind:        "video",
		ContentType: "video/mp4",
		Path:        outPath,
		Source:      "derived",
		OutputDir:   outputDirForClient(outDir),
		Exportable:  toolsOK,
	}
}

func inspectAssetBundlePreview(label string) PreviewInfo {
	outDir := filepath.Join(previewRoot, "assetbundle", sanitizeLabel(label))
	info := findBundlePreview(outDir)
	info.OutputDir = outputDirForClient(outDir)
	info.Exportable = assetBundleExportConfigured()
	return info
}

func ensureAssetBundlePreview(label string, plainPath string, force bool) PreviewInfo {
	return ensureAssetBundlePreviewWithProgress(label, plainPath, force, nil)
}

func ensureAssetBundlePreviewWithProgress(label string, plainPath string, force bool, report PreviewProgressReporter) PreviewInfo {
	outDir := filepath.Join(previewRoot, "assetbundle", sanitizeLabel(label))
	_ = os.MkdirAll(outDir, 0755)

	if !force {
		if info := findBundlePreview(outDir); info.Available {
			reportPreviewProgress(report, 100, "cached", "")
			info.OutputDir = outputDirForClient(outDir)
			info.Exportable = assetBundleExportConfigured()
			return info
		}
	}

	if !assetBundleExportConfigured() {
		return PreviewInfo{
			OutputDir:  outputDirForClient(outDir),
			Exportable: false,
		}
	}
	reportPreviewProgress(report, 20, "prepare", "")

	if assetRipperConfigured() {
		reportPreviewProgress(report, 46, "transcode", "assetripper")
		if err := assetRipperExport(plainPath, outDir); err != nil {
			debugLog("AssetRipper export failed: %v", err)
		}
	} else {
		cmdLine := strings.ReplaceAll(os.Getenv("HAILSTORM_ASSETRIPPER_CMD"), "{input}", shellEscape(plainPath))
		cmdLine = strings.ReplaceAll(cmdLine, "{output}", shellEscape(outDir))
		reportPreviewProgress(report, 46, "transcode", "custom-command")
		if err := exec.Command("sh", "-c", cmdLine).Run(); err != nil {
			debugLog("Assetbundle export command failed: %v", err)
		}
	}
	reportPreviewProgress(report, 94, "finalize", "")

	info := findBundlePreview(outDir)
	info.OutputDir = outputDirForClient(outDir)
	info.Exportable = assetBundleExportConfigured()
	return info
}

func findBundlePreview(dir string) PreviewInfo {
	if prefab := findPrefabPreview(dir); prefab.Available {
		return prefab
	}

	if img := firstMatchRecursive(dir, []string{"*.png", "*.jpg", "*.jpeg", "*.webp"}); img != "" {
		ctype := "image/png"
		ext := strings.ToLower(filepath.Ext(img))
		switch ext {
		case ".jpg", ".jpeg":
			ctype = "image/jpeg"
		case ".webp":
			ctype = "image/webp"
		case ".png":
			ctype = "image/png"
		}
		return PreviewInfo{
			Available:   true,
			Kind:        "image",
			ContentType: ctype,
			Path:        img,
			Source:      "derived",
		}
	}
	if vid := firstMatchRecursiveExt(dir, []string{".mp4", ".webm"}); vid != "" {
		ctype := "video/mp4"
		if strings.HasSuffix(strings.ToLower(vid), ".webm") {
			ctype = "video/webm"
		}
		return PreviewInfo{
			Available:   true,
			Kind:        "video",
			ContentType: ctype,
			Path:        vid,
			Source:      "derived",
		}
	}
	if usm := firstMatchRecursiveExt(dir, []string{".usm"}); usm != "" {
		if derived, ok := ensureUsmDerivedVideo(usm); ok {
			return PreviewInfo{
				Available:   true,
				Kind:        "video",
				ContentType: "video/mp4",
				Path:        derived,
				Source:      "derived",
			}
		}
	}
	if model := firstMatchRecursive(dir, []string{"*.glb", "*.gltf"}); model != "" {
		ctype := "model/gltf-binary"
		if strings.HasSuffix(strings.ToLower(model), ".gltf") {
			ctype = "model/gltf+json"
		}
		return PreviewInfo{
			Available:   true,
			Kind:        "model",
			ContentType: ctype,
			Path:        model,
			Source:      "derived",
		}
	}
	if mesh := firstMeshJSON(dir); mesh != "" {
		return PreviewInfo{
			Available:   true,
			Kind:        "text",
			ContentType: "application/json",
			Path:        mesh,
			Source:      "derived",
		}
	}
	return PreviewInfo{}
}

func findPrefabPreview(dir string) PreviewInfo {
	assetsDir := filepath.Join(dir, "Assets")
	prefabHierarchyDir := filepath.Join(assetsDir, "PrefabHierarchyObject")
	bundleJSON := firstMatch(filepath.Join(assetsDir, "AssetBundle"), []string{"*.json"})
	desc := parseBundleDescriptor(bundleJSON)

	isPrefab := false
	if info, err := os.Stat(prefabHierarchyDir); err == nil && info.IsDir() {
		isPrefab = true
	}
	if strings.HasSuffix(strings.ToLower(desc.BundleName), ".prefab") {
		isPrefab = true
	}
	if !isPrefab {
		return PreviewInfo{}
	}

	items := collectPrefabItems(dir, prefabHierarchyDir)
	primary, ok := pickPrimaryPreviewItem(items)
	if !ok && len(items) == 0 {
		items = nil
	}

	assetGroups, assetTotal := collectPrefabAssetGroups(assetsDir)
	rootObjects := collectPrefabRootObjects(prefabHierarchyDir)
	hierarchy := buildPrefabHierarchySummary(prefabHierarchyDir, items)
	bundleName := strings.TrimSpace(desc.BundleName)
	if bundleName == "" {
		bundleName = filepath.Base(dir)
	}

	meta := map[string]any{
		"bundleName":      bundleName,
		"dependencies":    desc.Dependencies,
		"dependencyCount": len(desc.Dependencies),
		"assetGroups":     assetGroups,
		"assetTotal":      assetTotal,
		"rootObjects":     rootObjects,
		"itemCount":       len(items),
		"hierarchy":       hierarchy,
	}

	info := PreviewInfo{
		Available: true,
		Kind:      "prefab",
		Source:    "derived",
		Items:     items,
		Meta:      meta,
	}
	if ok {
		info.Path = primary.Path
		info.ContentType = primary.ContentType
	}
	return info
}

func parseBundleDescriptor(path string) bundleDescriptor {
	if strings.TrimSpace(path) == "" {
		return bundleDescriptor{}
	}
	file, err := os.Open(path)
	if err != nil {
		return bundleDescriptor{}
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	scanner.Buffer(make([]byte, 0, 64*1024), 4*1024*1024)

	deps := make([]string, 0, 16)
	depSeen := map[string]struct{}{}
	inDeps := false
	name := ""

	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if name == "" {
			if match := bundleNameLineRE.FindStringSubmatch(line); len(match) > 1 {
				name = strings.TrimSpace(match[1])
			}
		}

		if !inDeps {
			if strings.Contains(line, `"m_Dependencies"`) && strings.Contains(line, "[") {
				inDeps = true
				if strings.Contains(line, "]") {
					inDeps = false
				}
			}
			continue
		}

		if strings.Contains(line, "]") {
			inDeps = false
			continue
		}

		match := quotedStringLineRE.FindStringSubmatch(line)
		if len(match) < 2 {
			continue
		}
		dep := strings.TrimSpace(match[1])
		if dep == "" {
			continue
		}
		if _, exists := depSeen[dep]; exists {
			continue
		}
		depSeen[dep] = struct{}{}
		deps = append(deps, dep)
	}

	if name == "" {
		name = strings.TrimSuffix(filepath.Base(path), filepath.Ext(path))
	}
	return bundleDescriptor{
		BundleName:   name,
		Dependencies: deps,
	}
}

func collectPrefabItems(dir string, prefabHierarchyDir string) []PreviewItem {
	items := make([]PreviewItem, 0, 16)
	seen := map[string]struct{}{}

	addPath := func(path string) {
		path = strings.TrimSpace(path)
		if path == "" {
			return
		}
		if _, exists := seen[path]; exists {
			return
		}
		kind, ctype := previewKindAndTypeByExt(path)
		if kind == "" {
			return
		}
		seen[path] = struct{}{}
		item := PreviewItem{
			ID:          fmt.Sprintf("pf%03d", len(items)+1),
			ContentType: ctype,
			Path:        path,
			Kind:        kind,
			Name:        filepath.Base(path),
		}
		items = append(items, item)
	}

	for _, path := range collectMatchesRecursiveExt(prefabHierarchyDir, []string{".glb", ".gltf"}, 8) {
		addPath(path)
	}
	for _, path := range collectMatchesRecursiveExt(dir, []string{".glb", ".gltf"}, 8) {
		addPath(path)
	}
	for _, path := range collectMatchesRecursiveExt(dir, []string{".png", ".jpg", ".jpeg", ".webp"}, 8) {
		addPath(path)
	}
	for _, path := range collectMatchesRecursiveExt(dir, []string{".mp4", ".webm"}, 4) {
		addPath(path)
	}
	return items
}

func previewKindAndTypeByExt(path string) (string, string) {
	ext := strings.ToLower(filepath.Ext(strings.TrimSpace(path)))
	switch ext {
	case ".png":
		return "image", "image/png"
	case ".jpg", ".jpeg":
		return "image", "image/jpeg"
	case ".webp":
		return "image", "image/webp"
	case ".mp4":
		return "video", "video/mp4"
	case ".webm":
		return "video", "video/webm"
	case ".glb":
		return "model", "model/gltf-binary"
	case ".gltf":
		return "model", "model/gltf+json"
	default:
		return "", ""
	}
}

func collectMatchesRecursiveExt(dir string, exts []string, limit int) []string {
	if strings.TrimSpace(dir) == "" || len(exts) == 0 || limit == 0 {
		return nil
	}

	extSet := map[string]struct{}{}
	for _, ext := range exts {
		ext = strings.ToLower(strings.TrimSpace(ext))
		if ext == "" {
			continue
		}
		if !strings.HasPrefix(ext, ".") {
			ext = "." + ext
		}
		extSet[ext] = struct{}{}
	}
	if len(extSet) == 0 {
		return nil
	}

	matches := make([]string, 0, limit)
	_ = filepath.WalkDir(dir, func(path string, entry os.DirEntry, err error) error {
		if err != nil || entry.IsDir() {
			return nil
		}
		ext := strings.ToLower(filepath.Ext(entry.Name()))
		if _, ok := extSet[ext]; !ok {
			return nil
		}
		matches = append(matches, path)
		return nil
	})

	if len(matches) == 0 {
		return nil
	}
	sort.Strings(matches)
	if limit > 0 && len(matches) > limit {
		matches = matches[:limit]
	}
	return matches
}

func pickPrimaryPreviewItem(items []PreviewItem) (PreviewItem, bool) {
	if len(items) == 0 {
		return PreviewItem{}, false
	}

	best := items[0]
	bestRank := previewItemKindRank(best.Kind)
	for _, item := range items[1:] {
		rank := previewItemKindRank(item.Kind)
		if rank < bestRank {
			best = item
			bestRank = rank
		}
	}
	return best, true
}

func previewItemKindRank(kind string) int {
	switch strings.ToLower(strings.TrimSpace(kind)) {
	case "model":
		return 0
	case "image":
		return 1
	case "video":
		return 2
	default:
		return 3
	}
}

func collectPrefabAssetGroups(assetsDir string) ([]PrefabAssetGroup, int) {
	entries, err := os.ReadDir(assetsDir)
	if err != nil {
		return nil, 0
	}

	groups := make([]PrefabAssetGroup, 0, len(entries))
	total := 0
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		count := countFilesRecursive(filepath.Join(assetsDir, entry.Name()))
		if count == 0 {
			continue
		}
		groups = append(groups, PrefabAssetGroup{
			Name:  entry.Name(),
			Count: count,
		})
		total += count
	}

	sort.Slice(groups, func(i, j int) bool {
		if groups[i].Count == groups[j].Count {
			return strings.ToLower(groups[i].Name) < strings.ToLower(groups[j].Name)
		}
		return groups[i].Count > groups[j].Count
	})
	return groups, total
}

func countFilesRecursive(root string) int {
	count := 0
	_ = filepath.WalkDir(root, func(path string, entry os.DirEntry, err error) error {
		if err != nil || entry.IsDir() {
			return nil
		}
		count++
		return nil
	})
	return count
}

func collectPrefabRootObjects(prefabHierarchyDir string) []string {
	if strings.TrimSpace(prefabHierarchyDir) == "" {
		return nil
	}
	matches := collectMatchesRecursiveExt(prefabHierarchyDir, []string{".glb", ".gltf"}, 24)
	if len(matches) == 0 {
		return nil
	}

	names := make([]string, 0, len(matches))
	for _, match := range matches {
		base := filepath.Base(match)
		base = strings.TrimSuffix(base, filepath.Ext(base))
		if strings.TrimSpace(base) == "" {
			continue
		}
		names = append(names, base)
	}
	if len(names) == 0 {
		return nil
	}

	sort.Strings(names)
	uniq := names[:0]
	last := ""
	for _, name := range names {
		if name == last {
			continue
		}
		uniq = append(uniq, name)
		last = name
	}
	return uniq
}

func buildPrefabHierarchySummary(prefabHierarchyDir string, items []PreviewItem) prefabHierarchySummary {
	modelPath := findPrefabHierarchyModelPath(prefabHierarchyDir, items)
	if modelPath == "" {
		return prefabHierarchySummary{
			Available: false,
			Error:     "no model found",
		}
	}

	doc, source, err := parseGLTFDocumentFromFile(modelPath)
	if err != nil {
		return prefabHierarchySummary{
			Available: false,
			Source:    source,
			Error:     err.Error(),
		}
	}
	if len(doc.Nodes) == 0 {
		return prefabHierarchySummary{
			Available: false,
			Source:    source,
			Error:     "empty nodes",
		}
	}

	rootIndices := gltfRootNodeIndices(doc)
	if len(rootIndices) == 0 {
		return prefabHierarchySummary{
			Available: false,
			Source:    source,
			Error:     "no root nodes",
			NodeCount: len(doc.Nodes),
		}
	}

	rendered := 0
	maxDepth := 0
	truncated := false
	componentCounter := map[string]int{}
	roots := make([]prefabHierarchyNode, 0, len(rootIndices))
	path := map[int]bool{}

	for _, root := range rootIndices {
		if rendered >= prefabHierarchyMaxNodes {
			truncated = true
			break
		}
		node := buildPrefabHierarchyNode(
			doc.Nodes,
			root,
			0,
			prefabHierarchyMaxNodes,
			&rendered,
			&maxDepth,
			&truncated,
			componentCounter,
			path,
		)
		roots = append(roots, node)
	}

	if rendered < len(doc.Nodes) && rendered >= prefabHierarchyMaxNodes {
		truncated = true
	}

	return prefabHierarchySummary{
		Available:         true,
		Source:            source,
		NodeCount:         len(doc.Nodes),
		RenderedNodeCount: rendered,
		RootCount:         len(rootIndices),
		MaxDepth:          maxDepth,
		Truncated:         truncated,
		ComponentStats:    sortPrefabComponentStats(componentCounter),
		Roots:             roots,
	}
}

func findPrefabHierarchyModelPath(prefabHierarchyDir string, items []PreviewItem) string {
	matches := collectMatchesRecursiveExt(prefabHierarchyDir, []string{".glb", ".gltf"}, 1)
	if len(matches) > 0 && fileExists(matches[0]) {
		return matches[0]
	}
	for _, item := range items {
		if strings.EqualFold(strings.TrimSpace(item.Kind), "model") && fileExists(item.Path) {
			return item.Path
		}
	}
	return ""
}

func parseGLTFDocumentFromFile(path string) (gltfDocument, string, error) {
	path = strings.TrimSpace(path)
	ext := strings.ToLower(filepath.Ext(path))
	switch ext {
	case ".glb":
		chunk, err := readGLBJSONChunk(path)
		if err != nil {
			return gltfDocument{}, "glb", err
		}
		doc := gltfDocument{}
		if err := json.Unmarshal(chunk, &doc); err != nil {
			return gltfDocument{}, "glb", err
		}
		return doc, "glb", nil
	case ".gltf":
		raw, err := os.ReadFile(path)
		if err != nil {
			return gltfDocument{}, "gltf", err
		}
		doc := gltfDocument{}
		if err := json.Unmarshal(raw, &doc); err != nil {
			return gltfDocument{}, "gltf", err
		}
		return doc, "gltf", nil
	default:
		return gltfDocument{}, ext, fmt.Errorf("unsupported model format: %s", ext)
	}
}

func readGLBJSONChunk(path string) ([]byte, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	if len(raw) < 20 {
		return nil, errors.New("invalid glb: too small")
	}
	if string(raw[:4]) != "glTF" {
		return nil, errors.New("invalid glb magic")
	}

	totalLength := int(binary.LittleEndian.Uint32(raw[8:12]))
	limit := len(raw)
	if totalLength > 0 && totalLength < limit {
		limit = totalLength
	}

	const jsonChunkType = 0x4E4F534A // "JSON" little-endian
	offset := 12
	for offset+8 <= limit {
		chunkLength := int(binary.LittleEndian.Uint32(raw[offset : offset+4]))
		chunkType := binary.LittleEndian.Uint32(raw[offset+4 : offset+8])
		offset += 8
		if chunkLength < 0 || offset+chunkLength > limit {
			return nil, errors.New("invalid glb chunk bounds")
		}
		chunk := raw[offset : offset+chunkLength]
		offset += chunkLength
		if chunkType == jsonChunkType {
			chunk = bytes.TrimRight(chunk, "\x00 \n\r\t")
			if len(chunk) == 0 {
				return nil, errors.New("empty glb json chunk")
			}
			return chunk, nil
		}
	}
	return nil, errors.New("glb json chunk not found")
}

func gltfRootNodeIndices(doc gltfDocument) []int {
	valid := func(index int) bool {
		return index >= 0 && index < len(doc.Nodes)
	}
	uniqueValid := func(indices []int) []int {
		out := make([]int, 0, len(indices))
		seen := map[int]struct{}{}
		for _, index := range indices {
			if !valid(index) {
				continue
			}
			if _, ok := seen[index]; ok {
				continue
			}
			seen[index] = struct{}{}
			out = append(out, index)
		}
		return out
	}

	if doc.Scene != nil && *doc.Scene >= 0 && *doc.Scene < len(doc.Scenes) {
		roots := uniqueValid(doc.Scenes[*doc.Scene].Nodes)
		if len(roots) > 0 {
			return roots
		}
	}
	if len(doc.Scenes) > 0 {
		roots := uniqueValid(doc.Scenes[0].Nodes)
		if len(roots) > 0 {
			return roots
		}
	}

	referenced := map[int]struct{}{}
	for _, node := range doc.Nodes {
		for _, child := range node.Children {
			if valid(child) {
				referenced[child] = struct{}{}
			}
		}
	}

	roots := make([]int, 0, len(doc.Nodes))
	for index := range doc.Nodes {
		if _, used := referenced[index]; used {
			continue
		}
		roots = append(roots, index)
	}
	if len(roots) == 0 && len(doc.Nodes) > 0 {
		return []int{0}
	}
	return roots
}

func buildPrefabHierarchyNode(
	nodes []gltfNode,
	index int,
	depth int,
	maxNodes int,
	rendered *int,
	maxDepth *int,
	truncated *bool,
	componentCounter map[string]int,
	path map[int]bool,
) prefabHierarchyNode {
	if index < 0 || index >= len(nodes) {
		return prefabHierarchyNode{
			Name:       fmt.Sprintf("Invalid node #%d", index),
			Index:      index,
			Components: []string{"Invalid"},
		}
	}
	if path[index] {
		return prefabHierarchyNode{
			Name:       fmt.Sprintf("%s (cycle)", prefabNodeName(nodes[index], index)),
			Index:      index,
			Components: []string{"Cycle"},
		}
	}

	path[index] = true
	defer delete(path, index)

	*rendered = *rendered + 1
	if depth > *maxDepth {
		*maxDepth = depth
	}

	node := nodes[index]
	components := derivePrefabNodeComponents(node)
	for _, component := range components {
		componentCounter[component]++
	}

	treeNode := prefabHierarchyNode{
		Name:       prefabNodeName(node, index),
		Index:      index,
		Components: components,
	}

	if len(node.Children) == 0 {
		return treeNode
	}
	children := make([]prefabHierarchyNode, 0, len(node.Children))
	for _, child := range node.Children {
		if *rendered >= maxNodes {
			*truncated = true
			break
		}
		childNode := buildPrefabHierarchyNode(
			nodes,
			child,
			depth+1,
			maxNodes,
			rendered,
			maxDepth,
			truncated,
			componentCounter,
			path,
		)
		children = append(children, childNode)
	}
	if len(children) > 0 {
		treeNode.Children = children
	}
	return treeNode
}

func prefabNodeName(node gltfNode, index int) string {
	name := strings.TrimSpace(node.Name)
	if name == "" {
		return fmt.Sprintf("Node %d", index)
	}
	return name
}

func derivePrefabNodeComponents(node gltfNode) []string {
	components := make([]string, 0, 8)
	appendUnique := func(value string) {
		value = strings.TrimSpace(value)
		if value == "" {
			return
		}
		for _, existing := range components {
			if existing == value {
				return
			}
		}
		components = append(components, value)
	}

	appendUnique("Transform")
	if node.Mesh != nil && node.Skin != nil {
		appendUnique("SkinnedMeshRenderer")
	} else if node.Mesh != nil {
		appendUnique("MeshRenderer")
	}
	if node.Skin != nil && node.Mesh == nil {
		appendUnique("Skin")
	}
	if node.Camera != nil {
		appendUnique("Camera")
	}
	if len(node.Weights) > 0 {
		appendUnique("BlendShape")
	}
	if hasNonZeroVec(node.Translation, 0) {
		appendUnique("Position")
	}
	if hasNonIdentityQuaternion(node.Rotation) {
		appendUnique("Rotation")
	}
	if hasNonUnitScale(node.Scale) {
		appendUnique("Scale")
	}

	lowerName := strings.ToLower(strings.TrimSpace(node.Name))
	if strings.Contains(lowerName, "collider") {
		appendUnique("Collider")
	}
	if strings.Contains(lowerName, "light") {
		appendUnique("Light")
	}
	if strings.Contains(lowerName, "bone") {
		appendUnique("Bone")
	}
	return components
}

func hasNonZeroVec(values []float64, zero float64) bool {
	for _, value := range values {
		if math.Abs(value-zero) > 1e-6 {
			return true
		}
	}
	return false
}

func hasNonIdentityQuaternion(values []float64) bool {
	if len(values) != 4 {
		return len(values) > 0
	}
	return math.Abs(values[0]) > 1e-6 ||
		math.Abs(values[1]) > 1e-6 ||
		math.Abs(values[2]) > 1e-6 ||
		math.Abs(values[3]-1) > 1e-6
}

func hasNonUnitScale(values []float64) bool {
	if len(values) == 0 {
		return false
	}
	for _, value := range values {
		if math.Abs(value-1) > 1e-6 {
			return true
		}
	}
	return false
}

func sortPrefabComponentStats(counter map[string]int) []prefabComponentStat {
	if len(counter) == 0 {
		return nil
	}
	stats := make([]prefabComponentStat, 0, len(counter))
	for name, count := range counter {
		stats = append(stats, prefabComponentStat{
			Name:  name,
			Count: count,
		})
	}
	sort.Slice(stats, func(i, j int) bool {
		if stats[i].Count == stats[j].Count {
			return stats[i].Name < stats[j].Name
		}
		return stats[i].Count > stats[j].Count
	})
	return stats
}

func firstMatch(dir string, patterns []string) string {
	for _, pattern := range patterns {
		matches, _ := filepath.Glob(filepath.Join(dir, pattern))
		if len(matches) > 0 {
			return matches[0]
		}
	}
	return ""
}

var errStopWalk = errors.New("stop walk")

func firstMatchRecursive(dir string, patterns []string) string {
	if len(patterns) == 0 {
		return ""
	}
	match := ""
	err := filepath.WalkDir(dir, func(path string, entry os.DirEntry, err error) error {
		if err != nil || entry.IsDir() {
			return nil
		}
		name := entry.Name()
		for _, pattern := range patterns {
			ok, matchErr := filepath.Match(pattern, name)
			if matchErr != nil || !ok {
				continue
			}
			match = path
			return errStopWalk
		}
		return nil
	})
	if err != nil && !errors.Is(err, errStopWalk) {
		return ""
	}
	return match
}

func firstMatchRecursiveExt(dir string, exts []string) string {
	if len(exts) == 0 {
		return ""
	}
	extSet := map[string]bool{}
	for _, ext := range exts {
		ext = strings.ToLower(strings.TrimSpace(ext))
		if ext == "" {
			continue
		}
		if !strings.HasPrefix(ext, ".") {
			ext = "." + ext
		}
		extSet[ext] = true
	}
	if len(extSet) == 0 {
		return ""
	}

	match := ""
	err := filepath.WalkDir(dir, func(path string, entry os.DirEntry, err error) error {
		if err != nil || entry.IsDir() {
			return nil
		}
		ext := strings.ToLower(filepath.Ext(entry.Name()))
		if !extSet[ext] {
			return nil
		}
		match = path
		return errStopWalk
	})
	if err != nil && !errors.Is(err, errStopWalk) {
		return ""
	}
	return match
}

func firstMeshJSON(dir string) string {
	meshDir := filepath.Join(dir, "Assets", "Mesh")
	info, err := os.Stat(meshDir)
	if err != nil || !info.IsDir() {
		return ""
	}
	matches, _ := filepath.Glob(filepath.Join(meshDir, "*.json"))
	for _, match := range matches {
		if meshHasVertices(match) {
			return match
		}
	}
	return ""
}

func meshHasVertices(path string) bool {
	file, err := os.Open(path)
	if err != nil {
		return false
	}
	defer file.Close()

	buf, err := io.ReadAll(io.LimitReader(file, 2*1024*1024))
	if err != nil {
		return false
	}
	match := meshVertexCountRE.FindSubmatch(buf)
	if len(match) < 2 {
		return false
	}
	count, err := strconv.Atoi(string(match[1]))
	if err != nil {
		return false
	}
	return count > 0
}

func detectStreamCount(path string) int {
	out, err := exec.Command("vgmstream-cli", "-m", path).Output()
	if err != nil {
		return 1
	}
	match := streamCountRE.FindStringSubmatch(string(out))
	if len(match) < 3 {
		return 1
	}
	count, err := strconv.Atoi(match[2])
	if err != nil || count < 1 {
		return 1
	}
	return count
}

func isFresh(outPath string, inputPath string) bool {
	outInfo, err := os.Stat(outPath)
	if err != nil {
		return false
	}
	inInfo, err := os.Stat(inputPath)
	if err != nil {
		return false
	}
	return outInfo.ModTime().After(inInfo.ModTime().Add(-1 * time.Second))
}

func isFreshForInputs(outPath string, inputPaths ...string) bool {
	outInfo, err := os.Stat(outPath)
	if err != nil {
		return false
	}
	for _, inputPath := range inputPaths {
		if strings.TrimSpace(inputPath) == "" {
			continue
		}
		inInfo, err := os.Stat(inputPath)
		if err != nil {
			return false
		}
		if !outInfo.ModTime().After(inInfo.ModTime().Add(-1 * time.Second)) {
			return false
		}
	}
	return true
}

func isAcb(label string) bool {
	return strings.HasSuffix(strings.ToLower(label), ".acb")
}

func isUsm(label string) bool {
	return strings.HasSuffix(strings.ToLower(label), ".usm")
}

func isAssetBundle(label string, resourceType uint32) bool {
	return resourceType == 1 || strings.HasSuffix(strings.ToLower(label), ".assetbundle")
}

func sanitizeLabel(label string) string {
	label = strings.ReplaceAll(label, "/", "_")
	label = strings.ReplaceAll(label, "\\", "_")
	return label
}

func shellEscape(value string) string {
	if value == "" {
		return "''"
	}
	value = strings.ReplaceAll(value, `'`, `'\''`)
	return "'" + value + "'"
}

func outputDirForClient(path string) string {
	if path == "" {
		return path
	}
	abs, err := filepath.Abs(path)
	if err != nil {
		return path
	}
	return abs
}

func encodeAcbToMp3(inputPath string, outPath string, subsong int) (PreviewItem, bool) {
	tmpDir, err := os.MkdirTemp("", "hailstorm-acb")
	if err != nil {
		return PreviewItem{}, false
	}
	defer os.RemoveAll(tmpDir)

	loopOnce := detectLoop(inputPath, subsong)
	tmpWav := filepath.Join(tmpDir, "preview.wav")
	vgmArgs := []string{}
	if subsong > 0 {
		vgmArgs = append(vgmArgs, "-s", fmt.Sprintf("%d", subsong))
	}
	if loopOnce {
		vgmArgs = append(vgmArgs, "-L")
	}
	vgmArgs = append(vgmArgs, inputPath, "-o", tmpWav)

	if err := exec.Command("vgmstream-cli", vgmArgs...).Run(); err != nil {
		return PreviewItem{}, false
	}

	if err := exec.Command(
		"ffmpeg",
		"-hide_banner",
		"-loglevel",
		"error",
		"-y",
		"-i",
		tmpWav,
		"-vn",
		"-c:a",
		"libmp3lame",
		"-q:a",
		"0",
		"-f",
		"mp3",
		outPath,
	).Run(); err != nil {
		return PreviewItem{}, false
	}

	itemID := "01"
	if subsong > 0 {
		itemID = fmt.Sprintf("%02d", subsong)
	}
	return PreviewItem{
		ID:          itemID,
		ContentType: "audio/mpeg",
		Path:        outPath,
	}, true
}

func detectLoop(path string, subsong int) bool {
	args := []string{"-m"}
	if subsong > 0 {
		args = append(args, "-s", fmt.Sprintf("%d", subsong))
	}
	args = append(args, path)
	out, err := exec.Command("vgmstream-cli", args...).Output()
	if err != nil {
		return false
	}
	return loopRE.Match(out)
}

func assetBundleExportConfigured() bool {
	if assetRipperConfigured() {
		return true
	}
	return strings.TrimSpace(os.Getenv("HAILSTORM_ASSETRIPPER_CMD")) != ""
}

func acbToolsAvailable() bool {
	if _, err := exec.LookPath("vgmstream-cli"); err != nil {
		return false
	}
	return ffmpegAvailable()
}

func ffmpegAvailable() bool {
	_, err := exec.LookPath("ffmpeg")
	return err == nil
}

func ensureUsmDerivedVideo(inputPath string) (string, bool) {
	if !ffmpegAvailable() {
		return "", false
	}
	outPath := inputPath + ".preview.mp4"
	if isFresh(outPath, inputPath) {
		return outPath, true
	}
	if !transcodeUsmToMp4(inputPath, "", outPath, nil) {
		return "", false
	}
	return outPath, true
}

func transcodeUsmToMp4(inputPath string, companionAudioPath string, outPath string, report PreviewProgressReporter) bool {
	// Prefer remux first for speed and to preserve original H.264 bitstream.
	// Some USM files carry no audio stream, so optional ACB companion audio can
	// be mapped as input #1.
	if companionAudioPath != "" {
		// USM packets may lack stable timestamps for stream-copy muxing. Assign
		// deterministic PTS/DTS from frame index so we can keep H.264 bitstream.
		fps := detectVideoFPS(inputPath)
		setTS := fmt.Sprintf("setts=pts=N/%.6f/TB:dts=N/%.6f/TB", fps, fps)
		reportPreviewProgress(report, 56, "remux", "")
		remuxWithAudioArgs := []string{
			"-hide_banner",
			"-loglevel", "error",
			"-y",
			"-fflags", "+genpts",
			"-i", inputPath,
			"-i", companionAudioPath,
			"-map", "0:v:0",
			"-map", "1:a:0",
			"-c:v", "copy",
			"-c:a", "copy",
			"-bsf:v", setTS,
			"-shortest",
			"-movflags", "+faststart",
			outPath,
		}
		if err := exec.Command("ffmpeg", remuxWithAudioArgs...).Run(); err == nil {
			return true
		}

		// Fallback when stream-copy muxing still fails on specific files.
		reportPreviewProgress(report, 76, "transcode", "")
		transcodeWithAudioArgs := []string{
			"-hide_banner",
			"-loglevel", "error",
			"-y",
			"-fflags", "+genpts",
			"-i", inputPath,
			"-i", companionAudioPath,
			"-map", "0:v:0",
			"-map", "1:a:0",
			"-c:v", "libx264",
			"-preset", "veryfast",
			"-pix_fmt", "yuv420p",
			"-profile:v", "main",
			"-level:v", "4.1",
			"-c:a", "copy",
			"-shortest",
			"-movflags", "+faststart",
			outPath,
		}
		return exec.Command("ffmpeg", transcodeWithAudioArgs...).Run() == nil
	}

	// USM-contained audio stream is optional.
	reportPreviewProgress(report, 56, "remux", "")
	remuxArgs := []string{
		"-hide_banner",
		"-loglevel", "error",
		"-y",
		"-fflags", "+genpts",
		"-i", inputPath,
		"-map", "0:v:0",
		"-map", "0:a?",
		"-c:v", "copy",
		"-c:a", "copy",
		"-movflags", "+faststart",
		outPath,
	}
	if err := exec.Command("ffmpeg", remuxArgs...).Run(); err == nil {
		return true
	}

	// Fallback to full transcode when remux fails on specific streams.
	reportPreviewProgress(report, 76, "transcode", "")
	transcodeArgs := []string{
		"-hide_banner",
		"-loglevel", "error",
		"-y",
		"-fflags", "+genpts",
		"-i", inputPath,
		"-map", "0:v:0",
		"-map", "0:a?",
		"-c:v", "libx264",
		"-preset", "veryfast",
		"-pix_fmt", "yuv420p",
		"-profile:v", "main",
		"-level:v", "4.1",
		"-c:a", "aac",
		"-ac", "2",
		"-movflags", "+faststart",
		outPath,
	}
	return exec.Command("ffmpeg", transcodeArgs...).Run() == nil
}

func detectVideoFPS(inputPath string) float64 {
	out, err := exec.Command(
		"ffprobe",
		"-v",
		"error",
		"-select_streams",
		"v:0",
		"-show_entries",
		"stream=avg_frame_rate,r_frame_rate",
		"-of",
		"default=noprint_wrappers=1:nokey=1",
		inputPath,
	).Output()
	if err != nil {
		return 30
	}

	lines := strings.Split(strings.TrimSpace(string(out)), "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" || line == "0/0" {
			continue
		}
		if fps, ok := parseFrameRate(line); ok {
			return fps
		}
	}
	return 30
}

func parseFrameRate(raw string) (float64, bool) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return 0, false
	}
	if strings.Contains(raw, "/") {
		parts := strings.SplitN(raw, "/", 2)
		if len(parts) != 2 {
			return 0, false
		}
		num, err := strconv.ParseFloat(strings.TrimSpace(parts[0]), 64)
		if err != nil || num <= 0 {
			return 0, false
		}
		den, err := strconv.ParseFloat(strings.TrimSpace(parts[1]), 64)
		if err != nil || den <= 0 {
			return 0, false
		}
		fps := num / den
		if fps <= 0 {
			return 0, false
		}
		return fps, true
	}
	fps, err := strconv.ParseFloat(raw, 64)
	if err != nil || fps <= 0 {
		return 0, false
	}
	return fps, true
}

func findUsmCompanionAcbPath(label string, usmPath string) string {
	dir := filepath.Dir(usmPath)
	fileName := strings.ToLower(filepath.Base(label))

	id := ""
	if match := musicLyricVideoRE.FindStringSubmatch(fileName); len(match) >= 2 {
		id = match[1]
	} else if match := trailingNumberBeforeExtRE.FindStringSubmatch(fileName); len(match) >= 2 {
		id = match[1]
	}
	if id == "" {
		return ""
	}

	prioritized := []string{
		fmt.Sprintf("bgm_live_%s01.acb", id),
		fmt.Sprintf("bgm_preview_%s01.acb", id),
	}
	for _, name := range prioritized {
		candidate := filepath.Join(dir, name)
		if fileExists(candidate) {
			return candidate
		}
	}

	any, _ := filepath.Glob(filepath.Join(dir, "*_"+id+"01.acb"))
	for _, candidate := range any {
		if fileExists(candidate) {
			return candidate
		}
	}
	return ""
}

func ensureAcbAudioForUsm(acbPath string) (string, bool) {
	if !acbToolsAvailable() {
		return "", false
	}
	outDir := filepath.Join(previewRoot, "usm-audio")
	if err := os.MkdirAll(outDir, 0755); err != nil {
		return "", false
	}
	base := strings.TrimSuffix(filepath.Base(acbPath), filepath.Ext(acbPath))
	outPath := filepath.Join(outDir, sanitizeLabel(base)+".m4a")
	if isFresh(outPath, acbPath) {
		return outPath, true
	}

	subsong := 0
	if detectStreamCount(acbPath) > 1 {
		subsong = 1
	}
	if !encodeAcbToM4A(acbPath, outPath, subsong) {
		return "", false
	}
	return outPath, true
}

func encodeAcbToM4A(inputPath string, outPath string, subsong int) bool {
	tmpDir, err := os.MkdirTemp("", "hailstorm-acb-usm")
	if err != nil {
		return false
	}
	defer os.RemoveAll(tmpDir)

	loopOnce := detectLoop(inputPath, subsong)
	tmpWav := filepath.Join(tmpDir, "preview.wav")
	vgmArgs := []string{}
	if subsong > 0 {
		vgmArgs = append(vgmArgs, "-s", fmt.Sprintf("%d", subsong))
	}
	if loopOnce {
		vgmArgs = append(vgmArgs, "-L")
	}
	vgmArgs = append(vgmArgs, inputPath, "-o", tmpWav)
	if err := exec.Command("vgmstream-cli", vgmArgs...).Run(); err != nil {
		return false
	}

	if err := exec.Command(
		"ffmpeg",
		"-hide_banner",
		"-loglevel",
		"error",
		"-y",
		"-i",
		tmpWav,
		"-vn",
		"-c:a",
		"aac",
		"-b:a",
		"192k",
		"-movflags",
		"+faststart",
		outPath,
	).Run(); err != nil {
		return false
	}
	return true
}

func sniffKnown(buf []byte) (string, string) {
	if len(buf) >= 12 {
		if bytes.HasPrefix(buf, []byte{0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a}) {
			return "image", "image/png"
		}
		if bytes.HasPrefix(buf, []byte{0xff, 0xd8, 0xff}) {
			return "image", "image/jpeg"
		}
		if bytes.HasPrefix(buf, []byte("GIF87a")) || bytes.HasPrefix(buf, []byte("GIF89a")) {
			return "image", "image/gif"
		}
		if bytes.HasPrefix(buf, []byte("RIFF")) && bytes.HasPrefix(buf[8:], []byte("WEBP")) {
			return "image", "image/webp"
		}
		if bytes.HasPrefix(buf, []byte("RIFF")) && bytes.HasPrefix(buf[8:], []byte("WAVE")) {
			return "audio", "audio/wav"
		}
		if bytes.HasPrefix(buf, []byte("OggS")) {
			return "audio", "audio/ogg"
		}
		if bytes.HasPrefix(buf, []byte("fLaC")) {
			return "audio", "audio/flac"
		}
		if bytes.HasPrefix(buf, []byte("ID3")) || (buf[0] == 0xff && buf[1]&0xe0 == 0xe0) {
			return "audio", "audio/mpeg"
		}
		if bytes.HasPrefix(buf, []byte("glTF")) {
			return "model", "model/gltf-binary"
		}
		if bytes.HasPrefix(buf[4:], []byte("ftyp")) {
			return "video", "video/mp4"
		}
		if bytes.HasPrefix(buf, []byte{0x1a, 0x45, 0xdf, 0xa3}) {
			return "video", "video/webm"
		}
	}
	return "", ""
}
