package webui

import (
	"bytes"
	"embed"
	"encoding/json"
	"errors"
	"fmt"
	"html/template"
	"io"
	"io/fs"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"vertesan/hailstorm/manifest"
	"vertesan/hailstorm/master"
	"vertesan/hailstorm/runner"
)

//go:embed templates/*.html static
var webAssets embed.FS

type Server struct {
	templates *template.Template
	staticFS  http.FileSystem
	catalog   *CatalogStore
	tasks     *TaskManager
	preview   *PreviewExportManager
	filtersMu sync.Mutex
	filters   AutoFilters
	filterMod time.Time
	filtersOK bool
}

func Run(addr string) error {
	srv, err := NewServer()
	if err != nil {
		return err
	}
	return http.ListenAndServe(addr, srv.routes())
}

func NewServer() (*Server, error) {
	templates, err := template.ParseFS(webAssets, "templates/*.html")
	if err != nil {
		return nil, err
	}
	static, err := fs.Sub(webAssets, "static")
	if err != nil {
		return nil, err
	}
	catalog := NewCatalogStore()
	_ = catalog.Reload()

	if assetRipperConfigured() {
		go func() {
			if err := ensureAssetRipperRunning(); err != nil {
				debugLog("AssetRipper start failed: %v", err)
			}
		}()
	}

	return &Server{
		templates: templates,
		staticFS:  http.FS(static),
		catalog:   catalog,
		tasks:     NewTaskManager(catalog),
		preview:   NewPreviewExportManager(),
	}, nil
}

func (s *Server) routes() http.Handler {
	mux := http.NewServeMux()
	mux.Handle("/static/", http.StripPrefix("/static/", http.FileServer(s.staticFS)))

	mux.HandleFunc("/", s.handleHome)
	mux.HandleFunc("/search", s.handleSearchPage)
	mux.HandleFunc("/view", s.handleViewPage)
	mux.HandleFunc("/masterdata", s.handleMasterPage)
	mux.HandleFunc("/readme", s.handleReadme)

	mux.HandleFunc("/api/status", s.handleStatus)
	mux.HandleFunc("/api/filters", s.handleFilters)
	mux.HandleFunc("/api/search", s.handleSearch)
	mux.HandleFunc("/api/entry", s.handleEntry)
	mux.HandleFunc("/api/entry/preview", s.handleEntryPreview)
	mux.HandleFunc("/api/entry/preview/export", s.handleEntryPreviewExport)
	mux.HandleFunc("/api/entry/preview/export/status", s.handleEntryPreviewExportStatus)
	mux.HandleFunc("/api/entry/raw", s.handleEntryRaw)
	mux.HandleFunc("/api/entry/plain", s.handleEntryPlain)
	mux.HandleFunc("/api/entry/yaml", s.handleEntryYaml)
	mux.HandleFunc("/api/masterdata", s.handleMasterList)
	mux.HandleFunc("/api/masterdata/file", s.handleMasterFile)
	mux.HandleFunc("/api/masterdata/versions", s.handleMasterVersions)
	mux.HandleFunc("/api/masterdata/diff", s.handleMasterDiff)
	mux.HandleFunc("/api/masterdata/diff/lookup", s.handleMasterDiffLookup)
	mux.HandleFunc("/api/tasks", s.handleTasks)
	mux.HandleFunc("/sse/tasks/", s.handleTaskStream)

	return mux
}

func (s *Server) render(w http.ResponseWriter, page string, data map[string]any) {
	if data == nil {
		data = make(map[string]any)
	}
	if _, ok := data["Title"]; !ok {
		data["Title"] = "Inspix Hailstorm WebUI"
	}

	var buf bytes.Buffer
	if err := s.templates.ExecuteTemplate(&buf, page, data); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	data["Content"] = template.HTML(buf.String())

	if err := s.templates.ExecuteTemplate(w, "layout.html", data); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
}

func (s *Server) handleHome(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/" {
		s.render(w, "404.html", map[string]any{
			"Title": "Not Found",
		})
		return
	}
	s.render(w, "home.html", nil)
}

func (s *Server) handleSearchPage(w http.ResponseWriter, r *http.Request) {
	data := map[string]any{
		"Query": r.URL.Query().Get("query"),
	}
	s.render(w, "search.html", data)
}

func (s *Server) handleReadme(w http.ResponseWriter, r *http.Request) {
	lang := strings.ToLower(r.URL.Query().Get("lang"))
	path := "README.md"
	if strings.HasPrefix(lang, "zh") {
		if fileExists("README.zh-CN.md") {
			path = "README.zh-CN.md"
		}
	}
	content, err := os.ReadFile(path)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}
	w.Header().Set("Content-Type", "text/markdown; charset=utf-8")
	_, _ = w.Write(content)
}

func (s *Server) handleViewPage(w http.ResponseWriter, r *http.Request) {
	label := r.URL.Query().Get("label")
	data := map[string]any{
		"Label": label,
	}
	s.render(w, "view.html", data)
}

func (s *Server) handleMasterPage(w http.ResponseWriter, r *http.Request) {
	s.render(w, "masterdata.html", nil)
}

func (s *Server) handleStatus(w http.ResponseWriter, r *http.Request) {
	_ = s.catalog.Reload()
	entries, modTime, loaded := s.catalog.Stats()

	version := ""
	if bytes, err := os.ReadFile(runner.CatalogVersionFile); err == nil {
		version = strings.TrimSpace(string(bytes))
	}

	updated := fileExists(runner.UpdatedFlagFile)
	plainDirExists := dirExists(runner.DecryptedAssetsSaveDir)
	assetsDirExists := dirExists(runner.AssetsSaveDir)
	masterFiles, _ := filepath.Glob(filepath.Join(runner.DbSaveDir, "*.yaml"))

	dbCount := 0
	if loaded {
		for _, entry := range entries {
			if entry.StrTypeCrc == "tsv" {
				dbCount++
			}
		}
	}

	catalogModified := ""
	if loaded {
		catalogModified = modTime.Format(time.RFC3339)
	}

	resp := map[string]any{
		"version":         version,
		"updated":         updated,
		"catalogLoaded":   loaded,
		"catalogEntries":  len(entries),
		"catalogModified": catalogModified,
		"dbEntries":       dbCount,
		"plainExists":     plainDirExists,
		"assetsExists":    assetsDirExists,
		"masterCount":     len(masterFiles),
	}
	writeJSON(w, resp)
}

func (s *Server) handleSearch(w http.ResponseWriter, r *http.Request) {
	_ = s.catalog.Reload()
	entries := s.catalog.Entries()
	query := strings.TrimSpace(r.URL.Query().Get("query"))
	field := strings.TrimSpace(r.URL.Query().Get("field"))
	withModTime := strings.TrimSpace(r.URL.Query().Get("withModTime")) == "1"
	filtered := filterEntries(entries, query, field)

	type item struct {
		Label        string `json:"label"`
		Name         string `json:"name"`
		Type         string `json:"type"`
		Size         uint64 `json:"size"`
		ResourceType uint32 `json:"resourceType"`
		RealName     string `json:"realName"`
		ModifiedAt   int64  `json:"modifiedAt,omitempty"`
	}

	resp := make([]item, 0, len(filtered))
	for _, entry := range filtered {
		modifiedAt := int64(0)
		if withModTime {
			modifiedAt = entryModifiedAtUnix(entry)
		}
		resp = append(resp, item{
			Label:        entry.StrLabelCrc,
			Name:         entry.StrLabelCrc,
			Type:         entry.StrTypeCrc,
			Size:         entry.Size,
			ResourceType: entry.ResourceType,
			RealName:     entry.RealName,
			ModifiedAt:   modifiedAt,
		})
	}
	writeJSON(w, resp)
}

func (s *Server) handleEntry(w http.ResponseWriter, r *http.Request) {
	entry, err := s.findEntry(r.URL.Query().Get("label"))
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	rawPath, rawOK := rawAssetPath(entry)
	plainPath := plainAssetPath(entry)
	plainOK := fileExists(plainPath)
	preview := PreviewInfo{}
	if plainOK {
		preview = resolvePreview(entry.StrLabelCrc, entry.StrTypeCrc, entry.ResourceType, plainPath)
	}

	yamlName := ""
	yamlOK := false
	if entry.StrTypeCrc == "tsv" {
		if ins, ok := master.MasterMap[entry.StrLabelCrc]; ok {
			yamlName = reflectTypeName(ins)
			yamlPath := filepath.Join(runner.DbSaveDir, yamlName+".yaml")
			yamlOK = fileExists(yamlPath)
		}
	}

	resp := map[string]any{
		"label":          entry.StrLabelCrc,
		"realName":       entry.RealName,
		"type":           entry.StrTypeCrc,
		"resourceType":   entry.ResourceType,
		"size":           entry.Size,
		"checksum":       entry.Checksum,
		"seed":           entry.Seed,
		"priority":       entry.Priority,
		"contentTypes":   entry.StrContentTypeCrcs,
		"categories":     entry.StrCategoryCrcs,
		"dependencies":   entry.StrDepCrcs,
		"rawAvailable":   rawOK,
		"rawPath":        rawPath,
		"plainAvailable": plainOK,
		"plainName":      assetDisplayName(entry),
		"yamlAvailable":  yamlOK,
		"yamlName":       yamlName,
		"preview":        previewPayload(preview),
	}
	writeJSON(w, resp)
}

func (s *Server) handleEntryPreview(w http.ResponseWriter, r *http.Request) {
	entry, err := s.findEntry(r.URL.Query().Get("label"))
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}
	path := plainAssetPath(entry)
	if !fileExists(path) {
		http.Error(w, "plain asset not found", http.StatusNotFound)
		return
	}
	preview := resolvePreview(entry.StrLabelCrc, entry.StrTypeCrc, entry.ResourceType, path)
	if !preview.Available {
		http.Error(w, "preview not supported", http.StatusUnsupportedMediaType)
		return
	}
	itemID := strings.TrimSpace(r.URL.Query().Get("item"))
	if itemID != "" {
		if item, ok := findPreviewItem(preview, itemID); ok {
			w.Header().Set("Content-Type", item.ContentType)
			http.ServeFile(w, r, item.Path)
			return
		}
		http.Error(w, "preview item not found", http.StatusNotFound)
		return
	}
	if preview.Path == "" && len(preview.Items) > 0 {
		w.Header().Set("Content-Type", preview.Items[0].ContentType)
		http.ServeFile(w, r, preview.Items[0].Path)
		return
	}
	if strings.TrimSpace(preview.Path) == "" {
		http.Error(w, "preview media not found", http.StatusNotFound)
		return
	}
	w.Header().Set("Content-Type", preview.ContentType)
	http.ServeFile(w, r, preview.Path)
}

func (s *Server) handleEntryPreviewExport(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	entry, err := s.findEntry(r.URL.Query().Get("label"))
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}
	path := plainAssetPath(entry)
	if !fileExists(path) {
		http.Error(w, "plain asset not found", http.StatusNotFound)
		return
	}

	force := r.URL.Query().Get("force") == "1"
	kind := ""
	preview := PreviewInfo{}
	switch {
	case isAssetBundle(entry.StrLabelCrc, entry.ResourceType):
		kind = "assetbundle"
		preview = inspectAssetBundlePreview(entry.StrLabelCrc)
	case isUsm(entry.StrLabelCrc):
		kind = "usm"
		preview = inspectUsmPreview(entry.StrLabelCrc, path)
	case isAcb(entry.StrLabelCrc):
		kind = "acb"
		preview = inspectAcbPreview(entry.StrLabelCrc, path)
	default:
		http.Error(w, "preview export not supported", http.StatusUnsupportedMediaType)
		return
	}

	if !preview.Exportable {
		http.Error(w, "preview export not configured", http.StatusConflict)
		return
	}

	task, reused := s.preview.Start(entry.StrLabelCrc, kind, func(report PreviewProgressReporter) (PreviewInfo, error) {
		reportPreviewProgress(report, 3, "prepare", "")
		var result PreviewInfo
		switch kind {
		case "assetbundle":
			result = ensureAssetBundlePreviewWithProgress(entry.StrLabelCrc, path, force, report)
		case "usm":
			result = ensureUsmPreviewWithProgress(entry.StrLabelCrc, path, force, report)
		case "acb":
			result = ensureAcbPreviewWithProgress(entry.StrLabelCrc, path, report)
		default:
			return PreviewInfo{}, errors.New("preview export not supported")
		}

		if !result.Exportable {
			return result, errors.New("preview export not configured")
		}
		if !result.Available {
			return result, errors.New("preview export failed")
		}
		return result, nil
	})

	w.WriteHeader(http.StatusAccepted)
	resp := map[string]any{
		"ok":     true,
		"reused": reused,
		"task":   task.Snapshot(),
	}
	writeJSON(w, resp)
}

func (s *Server) handleEntryPreviewExportStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	id := strings.TrimSpace(r.URL.Query().Get("id"))
	if id == "" {
		http.Error(w, "missing id", http.StatusBadRequest)
		return
	}
	task := s.preview.Get(id)
	if task == nil {
		http.Error(w, "task not found", http.StatusNotFound)
		return
	}
	writeJSON(w, map[string]any{
		"ok":   true,
		"task": task.Snapshot(),
	})
}

func (s *Server) handleEntryRaw(w http.ResponseWriter, r *http.Request) {
	entry, err := s.findEntry(r.URL.Query().Get("label"))
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}
	path, ok := rawAssetPath(entry)
	if !ok {
		http.Error(w, "raw asset not found", http.StatusNotFound)
		return
	}
	http.ServeFile(w, r, path)
}

func (s *Server) handleEntryPlain(w http.ResponseWriter, r *http.Request) {
	entry, err := s.findEntry(r.URL.Query().Get("label"))
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}
	path := plainAssetPath(entry)
	if !fileExists(path) {
		http.Error(w, "plain asset not found", http.StatusNotFound)
		return
	}
	http.ServeFile(w, r, path)
}

func (s *Server) handleEntryYaml(w http.ResponseWriter, r *http.Request) {
	entry, err := s.findEntry(r.URL.Query().Get("label"))
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}
	if entry.StrTypeCrc != "tsv" {
		http.Error(w, "not a database entry", http.StatusBadRequest)
		return
	}
	ins, ok := master.MasterMap[entry.StrLabelCrc]
	if !ok {
		http.Error(w, "database mapping not found", http.StatusNotFound)
		return
	}
	name := reflectTypeName(ins)
	path := filepath.Join(runner.DbSaveDir, name+".yaml")
	if !fileExists(path) {
		http.Error(w, "yaml not found", http.StatusNotFound)
		return
	}
	http.ServeFile(w, r, path)
}

func (s *Server) handleMasterList(w http.ResponseWriter, r *http.Request) {
	files, err := filepath.Glob(filepath.Join(runner.DbSaveDir, "*.yaml"))
	if err != nil {
		writeJSON(w, map[string]string{"error": err.Error()})
		return
	}
	type item struct {
		Name string `json:"name"`
		Size int64  `json:"size"`
	}
	resp := []item{}
	for _, file := range files {
		info, err := os.Stat(file)
		if err != nil {
			continue
		}
		resp = append(resp, item{
			Name: strings.TrimSuffix(filepath.Base(file), ".yaml"),
			Size: info.Size(),
		})
	}
	sort.Slice(resp, func(i, j int) bool { return resp[i].Name < resp[j].Name })
	writeJSON(w, resp)
}

func (s *Server) handleMasterFile(w http.ResponseWriter, r *http.Request) {
	name := strings.TrimSpace(r.URL.Query().Get("name"))
	if name == "" {
		http.Error(w, "missing name", http.StatusBadRequest)
		return
	}
	if strings.Contains(name, "/") || strings.Contains(name, "\\") || strings.Contains(name, "..") {
		http.Error(w, "invalid name", http.StatusBadRequest)
		return
	}
	path := filepath.Join(runner.DbSaveDir, name+".yaml")
	if !fileExists(path) {
		http.Error(w, "yaml not found", http.StatusNotFound)
		return
	}
	http.ServeFile(w, r, path)
}

func (s *Server) handleTasks(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		list := s.tasks.List()
		type item struct {
			ID        string     `json:"id"`
			Mode      string     `json:"mode"`
			Status    TaskStatus `json:"status"`
			StartedAt string     `json:"startedAt"`
			EndedAt   string     `json:"endedAt"`
			Error     string     `json:"error"`
		}
		resp := make([]item, 0, len(list))
		for _, task := range list {
			ended := ""
			if !task.EndedAt.IsZero() {
				ended = task.EndedAt.Format(time.RFC3339)
			}
			resp = append(resp, item{
				ID:        task.ID,
				Mode:      task.Mode,
				Status:    task.Status,
				StartedAt: task.StartedAt.Format(time.RFC3339),
				EndedAt:   ended,
				Error:     task.Err,
			})
		}
		writeJSON(w, resp)
	case http.MethodPost:
		body, err := io.ReadAll(r.Body)
		if err != nil {
			http.Error(w, "invalid body", http.StatusBadRequest)
			return
		}
		var req struct {
			Mode          string `json:"mode"`
			Force         bool   `json:"force"`
			KeepRaw       bool   `json:"keepRaw"`
			KeepPath      bool   `json:"keepPath"`
			ClientVersion string `json:"clientVersion"`
			ResInfo       string `json:"resInfo"`
			FilterRegex   string `json:"filterRegex"`
		}
		if err := json.Unmarshal(body, &req); err != nil {
			http.Error(w, "invalid json", http.StatusBadRequest)
			return
		}
		opts := runner.Options{
			Force:         req.Force,
			KeepRaw:       req.KeepRaw,
			KeepPath:      req.KeepPath,
			ClientVersion: strings.TrimSpace(req.ClientVersion),
			ResInfo:       strings.TrimSpace(req.ResInfo),
			FilterRegex:   strings.TrimSpace(req.FilterRegex),
		}

		mode := strings.ToLower(strings.TrimSpace(req.Mode))
		switch mode {
		case "", "update":
		case "dbonly":
			opts.DbOnly = true
		case "catalog":
			opts.CatalogOnly = true
		case "convert":
			opts.Convert = true
		case "master":
			opts.Master = true
		case "analyze":
			opts.Analyze = true
		default:
			http.Error(w, "unknown mode", http.StatusBadRequest)
			return
		}

		task, err := s.tasks.Start(modeOrDefault(mode), opts)
		if err != nil {
			http.Error(w, err.Error(), http.StatusConflict)
			return
		}
		writeJSON(w, map[string]string{"id": task.ID})
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

func (s *Server) handleTaskStream(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimPrefix(r.URL.Path, "/sse/tasks/")
	task := s.tasks.Get(id)
	if task == nil {
		http.NotFound(w, r)
		return
	}

	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming unsupported", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")

	for _, entry := range task.Logs() {
		writeSSE(w, "log", entry)
	}
	flusher.Flush()

	ch := task.Subscribe()
	defer task.Unsubscribe(ch)

	for {
		select {
		case <-r.Context().Done():
			return
		case entry, ok := <-ch:
			if !ok {
				return
			}
			writeSSE(w, "log", entry)
			flusher.Flush()
		}
	}
}

func (s *Server) findEntry(label string) (manifest.Entry, error) {
	if strings.TrimSpace(label) == "" {
		return manifest.Entry{}, errors.New("missing label")
	}
	_ = s.catalog.Reload()
	entries := s.catalog.Entries()
	for _, entry := range entries {
		if entry.StrLabelCrc == label {
			return entry, nil
		}
	}
	return manifest.Entry{}, errors.New("entry not found")
}

func filterEntries(entries []manifest.Entry, query string, field string) []manifest.Entry {
	if query == "" {
		return entries
	}
	tokens := strings.Fields(strings.ToLower(query))
	if len(tokens) == 0 {
		return entries
	}
	field = strings.ToLower(strings.TrimSpace(field))

	out := make([]manifest.Entry, 0, len(entries))
	for _, entry := range entries {
		var haystackParts []string
		switch field {
		case "", "all":
			haystackParts = []string{
				entry.StrLabelCrc,
				entry.StrTypeCrc,
				entry.RealName,
				strings.Join(entry.StrContentTypeCrcs, " "),
				strings.Join(entry.StrCategoryCrcs, " "),
				strings.Join(entry.StrContentNameCrcs, " "),
				strings.Join(entry.StrDepCrcs, " "),
			}
		case "label":
			haystackParts = []string{entry.StrLabelCrc}
		case "type":
			haystackParts = []string{entry.StrTypeCrc}
		case "dependencies", "deps":
			haystackParts = []string{strings.Join(entry.StrDepCrcs, " ")}
		case "content", "contenttypes":
			haystackParts = []string{
				strings.Join(entry.StrContentTypeCrcs, " "),
				strings.Join(entry.StrContentNameCrcs, " "),
			}
		case "categories":
			haystackParts = []string{strings.Join(entry.StrCategoryCrcs, " ")}
		case "realname", "name":
			haystackParts = []string{entry.RealName}
		default:
			haystackParts = []string{
				entry.StrLabelCrc,
				entry.StrTypeCrc,
				entry.RealName,
				strings.Join(entry.StrContentTypeCrcs, " "),
				strings.Join(entry.StrCategoryCrcs, " "),
				strings.Join(entry.StrContentNameCrcs, " "),
				strings.Join(entry.StrDepCrcs, " "),
			}
		}
		haystack := strings.ToLower(strings.Join(haystackParts, " "))
		matched := true
		for _, token := range tokens {
			if !strings.Contains(haystack, token) {
				matched = false
				break
			}
		}
		if matched {
			out = append(out, entry)
		}
	}
	return out
}

func modeOrDefault(mode string) string {
	if mode == "" {
		return "update"
	}
	return mode
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	enc := json.NewEncoder(w)
	enc.SetIndent("", "  ")
	_ = enc.Encode(v)
}

func writeSSE(w io.Writer, event string, v any) {
	payload, _ := json.Marshal(v)
	if event != "" {
		fmt.Fprintf(w, "event: %s\n", event)
	}
	fmt.Fprintf(w, "data: %s\n\n", payload)
}

func previewPayload(preview PreviewInfo) map[string]any {
	return map[string]any{
		"available":  preview.Available,
		"kind":       preview.Kind,
		"type":       preview.ContentType,
		"source":     preview.Source,
		"exportable": preview.Exportable,
		"outputDir":  preview.OutputDir,
		"items":      previewItems(preview),
		"meta":       preview.Meta,
	}
}

func previewItems(preview PreviewInfo) []map[string]any {
	if len(preview.Items) == 0 {
		return nil
	}
	resp := make([]map[string]any, 0, len(preview.Items))
	for _, item := range preview.Items {
		payload := map[string]any{
			"id":   item.ID,
			"type": item.ContentType,
		}
		if strings.TrimSpace(item.Kind) != "" {
			payload["kind"] = item.Kind
		}
		if strings.TrimSpace(item.Name) != "" {
			payload["name"] = item.Name
		}
		resp = append(resp, payload)
	}
	return resp
}

func findPreviewItem(preview PreviewInfo, id string) (PreviewItem, bool) {
	for _, item := range preview.Items {
		if item.ID == id {
			return item, true
		}
	}
	return PreviewItem{}, false
}

func reflectTypeName(instance any) string {
	t := fmt.Sprintf("%T", instance)
	t = strings.TrimPrefix(t, "*")
	parts := strings.Split(t, ".")
	return parts[len(parts)-1]
}

func dirExists(path string) bool {
	info, err := os.Stat(path)
	if err != nil {
		return false
	}
	return info.IsDir()
}

func entryModifiedAtUnix(entry manifest.Entry) int64 {
	plainPath := plainAssetPath(entry)
	if info, err := os.Stat(plainPath); err == nil && !info.IsDir() {
		return info.ModTime().Unix()
	}

	rawPath, ok := rawAssetPath(entry)
	if !ok {
		return 0
	}
	info, err := os.Stat(rawPath)
	if err != nil || info.IsDir() {
		return 0
	}
	return info.ModTime().Unix()
}
