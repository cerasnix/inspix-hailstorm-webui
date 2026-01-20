package webui

import (
	"bufio"
	"bytes"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"
)

const previewRoot = "cache/webui-preview"

type PreviewInfo struct {
	Available   bool
	Kind        string
	ContentType string
	Path        string
	Source      string
	OutputDir   string
	Exportable  bool
	Items       []PreviewItem
}

var loopRE = regexp.MustCompile(`(?i)\bloop (start|end)\b`)
var streamCountRE = regexp.MustCompile(`(?i)(stream count|streams|subsong count|subsongs)\s*:\s*(\d+)`)
var meshVertexCountRE = regexp.MustCompile(`"m_VertexCount"\s*:\s*(\d+)`)

type PreviewItem struct {
	ID          string
	ContentType string
	Path        string
}

func resolvePreview(entryLabel string, entryType string, resourceType uint32, plainPath string) PreviewInfo {
	if direct := sniffDirectPreview(plainPath); direct.Available {
		direct.Path = plainPath
		direct.Source = "plain"
		return direct
	}

	if isAcb(entryLabel) {
		if info := ensureAcbPreview(entryLabel, plainPath); info.Available || info.Exportable {
			return info
		}
	}

	if isAssetBundle(entryLabel, resourceType) {
		return ensureAssetBundlePreview(entryLabel, plainPath, false)
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

func ensureAcbPreview(label string, plainPath string) PreviewInfo {
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

	streamCount := detectStreamCount(plainPath)
	if streamCount <= 1 {
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

		_, ok := encodeAcbToMp3(plainPath, outPath, 0)
		if !ok {
			return PreviewInfo{
				OutputDir:  outputDirForClient(outDir),
				Exportable: toolsOK,
			}
		}
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
		if !isFresh(out, plainPath) {
			item, ok := encodeAcbToMp3(plainPath, out, i)
			if !ok {
				continue
			}
			items = append(items, item)
		} else {
			items = append(items, PreviewItem{
				ID:          fmt.Sprintf("%02d", i),
				ContentType: "audio/mpeg",
				Path:        out,
			})
		}
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

func ensureAssetBundlePreview(label string, plainPath string, force bool) PreviewInfo {
	outDir := filepath.Join(previewRoot, "assetbundle", sanitizeLabel(label))
	_ = os.MkdirAll(outDir, 0755)

	if !force {
		if info := findBundlePreview(outDir); info.Available {
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

	if assetRipperConfigured() {
		if err := assetRipperExport(plainPath, outDir); err != nil {
			debugLog("AssetRipper export failed: %v", err)
		}
	} else {
		cmdLine := strings.ReplaceAll(os.Getenv("HAILSTORM_ASSETRIPPER_CMD"), "{input}", shellEscape(plainPath))
		cmdLine = strings.ReplaceAll(cmdLine, "{output}", shellEscape(outDir))
		if err := exec.Command("sh", "-c", cmdLine).Run(); err != nil {
			debugLog("Assetbundle export command failed: %v", err)
		}
	}

	info := findBundlePreview(outDir)
	info.OutputDir = outputDirForClient(outDir)
	info.Exportable = assetBundleExportConfigured()
	return info
}

func findBundlePreview(dir string) PreviewInfo {
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
	if vid := firstMatchRecursive(dir, []string{"*.mp4", "*.webm"}); vid != "" {
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

func isAcb(label string) bool {
	return strings.HasSuffix(strings.ToLower(label), ".acb")
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
	if _, err := exec.LookPath("ffmpeg"); err != nil {
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
