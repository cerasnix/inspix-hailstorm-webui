package webui

import (
	"net/http"
	"path/filepath"
	"sort"
	"strings"
	"time"
	"unicode"

	"vertesan/hailstorm/manifest"
)

type AutoFilters struct {
	Media      map[string][]string `json:"media"`
	Characters []string            `json:"characters"`
}

type tokenStat struct {
	total  int
	byKind map[string]int
}

func (s *Server) handleFilters(w http.ResponseWriter, r *http.Request) {
	_ = s.catalog.Reload()
	entries, modTime, _ := s.catalog.Stats()
	cfg := s.autoFilters(entries, modTime)
	writeJSON(w, cfg)
}

func (s *Server) autoFilters(entries []manifest.Entry, modTime time.Time) AutoFilters {
	s.filtersMu.Lock()
	defer s.filtersMu.Unlock()

	if s.filtersOK && modTime.Equal(s.filterMod) {
		return s.filters
	}

	cfg := buildAutoFilters(entries)
	s.filters = cfg
	s.filterMod = modTime
	s.filtersOK = true
	return cfg
}

func buildAutoFilters(entries []manifest.Entry) AutoFilters {
	return AutoFilters{
		Media:      buildMediaTokens(entries),
		Characters: buildCharacterTokens(entries),
	}
}

func buildMediaTokens(entries []manifest.Entry) map[string][]string {
	stats := map[string]*tokenStat{}
	for _, entry := range entries {
		label := assetDisplayName(entry)
		kinds := seedMediaKinds(label, entry.StrTypeCrc)
		if len(kinds) == 0 {
			continue
		}
		tokens := uniqueTokens(tokenizeLabel(label))
		for _, token := range tokens {
			if !isMediaTokenCandidate(token) {
				continue
			}
			stat := stats[token]
			if stat == nil {
				stat = &tokenStat{byKind: map[string]int{}}
				stats[token] = stat
			}
			stat.total++
			for _, kind := range kinds {
				stat.byKind[kind]++
			}
		}
	}

	minCount := mediaTokenThreshold(len(entries))
	result := map[string][]string{}
	for _, kind := range mediaKinds() {
		candidates := []tokenCount{}
		for token, stat := range stats {
			if stat.total < minCount {
				continue
			}
			kindCount := stat.byKind[kind]
			if kindCount < minCount {
				continue
			}
			ratio := float64(kindCount) / float64(stat.total)
			if ratio < 0.68 {
				continue
			}
			candidates = append(candidates, tokenCount{token: token, count: kindCount})
		}
		sortTokens(candidates)
		if len(candidates) > 80 {
			candidates = candidates[:80]
		}
		for _, item := range candidates {
			result[kind] = append(result[kind], item.token)
		}
	}
	return result
}

func buildCharacterTokens(entries []manifest.Entry) []string {
	counts := map[string]int{}
	for _, entry := range entries {
		label := assetDisplayName(entry)
		tokens := tokenizeLabel(label)
		for i := 0; i+1 < len(tokens); i++ {
			if !characterPrefixes[strings.ToLower(tokens[i])] {
				continue
			}
			token := cleanCharacterToken(tokens[i+1])
			if token == "" {
				continue
			}
			counts[token]++
		}
	}

	minCount := characterTokenThreshold(len(entries))
	candidates := []tokenCount{}
	for token, count := range counts {
		if count < minCount {
			continue
		}
		candidates = append(candidates, tokenCount{token: token, count: count})
	}
	sortTokens(candidates)
	if len(candidates) > 60 {
		candidates = candidates[:60]
	}

	out := make([]string, 0, len(candidates))
	for _, item := range candidates {
		out = append(out, item.token)
	}
	return out
}

func seedMediaKinds(label string, entryType string) []string {
	lower := strings.ToLower(label)
	kinds := map[string]bool{}
	for _, suffix := range motionSuffixes {
		if strings.HasSuffix(lower, suffix) {
			kinds["motion"] = true
		}
	}
	for _, suffix := range modelSuffixes {
		if strings.HasSuffix(lower, suffix) {
			kinds["model"] = true
		}
	}

	ext := strings.TrimPrefix(filepath.Ext(lower), ".")
	if ext != "" {
		if kind, ok := mediaExtToKind[ext]; ok {
			kinds[kind] = true
		}
	} else if entryType != "" {
		if kind, ok := mediaExtToKind[strings.ToLower(entryType)]; ok {
			kinds[kind] = true
		}
	}

	if len(kinds) == 0 {
		return nil
	}
	out := make([]string, 0, len(kinds))
	for kind := range kinds {
		out = append(out, kind)
	}
	sort.Strings(out)
	return out
}

func tokenizeLabel(label string) []string {
	raw := strings.FieldsFunc(strings.ToLower(label), func(r rune) bool {
		return !unicode.IsLetter(r) && !unicode.IsDigit(r)
	})
	tokens := make([]string, 0, len(raw))
	for _, token := range raw {
		if token == "" {
			continue
		}
		tokens = append(tokens, token)
		trimmed := strings.TrimRightFunc(token, unicode.IsDigit)
		if trimmed != token && len(trimmed) >= 2 {
			tokens = append(tokens, trimmed)
		}
	}
	return tokens
}

func uniqueTokens(tokens []string) []string {
	seen := map[string]bool{}
	out := make([]string, 0, len(tokens))
	for _, token := range tokens {
		if token == "" || seen[token] {
			continue
		}
		seen[token] = true
		out = append(out, token)
	}
	return out
}

func isMediaTokenCandidate(token string) bool {
	if len(token) < 2 {
		return false
	}
	if mediaTokenStop[token] {
		return false
	}
	return hasLetter(token)
}

func cleanCharacterToken(token string) string {
	token = strings.ToLower(strings.TrimSpace(token))
	if token == "" {
		return ""
	}
	clean := strings.TrimRightFunc(token, unicode.IsDigit)
	if clean == "" {
		return ""
	}
	if !isCharacterToken(clean) {
		return ""
	}
	return clean
}

func isCharacterToken(token string) bool {
	if len(token) < 3 || len(token) > 16 {
		return false
	}
	if characterStop[token] {
		return false
	}
	if hasDigit(token) {
		return false
	}
	return hasLetter(token)
}

func hasLetter(token string) bool {
	for _, r := range token {
		if unicode.IsLetter(r) {
			return true
		}
	}
	return false
}

func hasDigit(token string) bool {
	for _, r := range token {
		if unicode.IsDigit(r) {
			return true
		}
	}
	return false
}

type tokenCount struct {
	token string
	count int
}

func sortTokens(tokens []tokenCount) {
	sort.Slice(tokens, func(i, j int) bool {
		if tokens[i].count == tokens[j].count {
			return tokens[i].token < tokens[j].token
		}
		return tokens[i].count > tokens[j].count
	})
}

func mediaTokenThreshold(total int) int {
	switch {
	case total > 50000:
		return 15
	case total > 15000:
		return 10
	case total > 5000:
		return 6
	default:
		return 3
	}
}

func characterTokenThreshold(total int) int {
	switch {
	case total > 20000:
		return 8
	case total > 5000:
		return 5
	default:
		return 3
	}
}

func mediaKinds() []string {
	return []string{"image", "video", "audio", "model", "motion"}
}

var mediaExtToKind = map[string]string{
	"png":  "image",
	"jpg":  "image",
	"jpeg": "image",
	"webp": "image",
	"gif":  "image",
	"bmp":  "image",
	"tga":  "image",
	"dds":  "image",
	"ktx":  "image",
	"ktx2": "image",
	"tif":  "image",
	"tiff": "image",

	"usm":  "video",
	"mp4":  "video",
	"webm": "video",
	"mov":  "video",
	"m4v":  "video",
	"avi":  "video",
	"mkv":  "video",

	"acb":  "audio",
	"awb":  "audio",
	"hca":  "audio",
	"adx":  "audio",
	"wav":  "audio",
	"ogg":  "audio",
	"mp3":  "audio",
	"flac": "audio",
	"aac":  "audio",
	"m4a":  "audio",
	"opus": "audio",
	"wma":  "audio",

	"glb":  "model",
	"gltf": "model",
	"fbx":  "model",
	"obj":  "model",
	"dae":  "model",

	"anim":       "motion",
	"controller": "motion",
	"mot":        "motion",
}

var motionSuffixes = []string{
	".anim.assetbundle",
	".controller.assetbundle",
	".motion.assetbundle",
}

var modelSuffixes = []string{
	".playable.assetbundle",
	".model.assetbundle",
	".mesh.assetbundle",
}

var mediaTokenStop = map[string]bool{
	"asset":       true,
	"assets":      true,
	"assetbundle": true,
	"bundle":      true,
	"data":        true,
	"common":      true,
	"shared":      true,
	"main":        true,
	"pack":        true,
	"res":         true,
	"resource":    true,
	"resources":   true,
	"cache":       true,
	"plain":       true,
}

var characterPrefixes = map[string]bool{
	"chara":     true,
	"character": true,
	"char":      true,
	"chr":       true,
	"card":      true,
	"idol":      true,
	"unit":      true,
	"dress":     true,
	"costume":   true,
	"live":      true,
	"profile":   true,
	"portrait":  true,
	"face":      true,
	"icon":      true,
	"voice":     true,
	"vo":        true,
	"model":     true,
	"motion":    true,
}

var characterStop = map[string]bool{
	"common":   true,
	"default":  true,
	"main":     true,
	"asset":    true,
	"assets":   true,
	"skill":    true,
	"middle":   true,
	"full":     true,
	"half":     true,
	"season":   true,
	"adv":      true,
	"icon":     true,
	"face":     true,
	"card":     true,
	"voice":    true,
	"vo":       true,
	"bgm":      true,
	"se":       true,
	"music":    true,
	"story":    true,
	"model":    true,
	"motion":   true,
	"event":    true,
	"shop":     true,
	"banner":   true,
	"title":    true,
	"scene":    true,
	"sprite":   true,
	"texture":  true,
	"image":    true,
	"movie":    true,
	"video":    true,
	"sound":    true,
	"stage":    true,
	"effect":   true,
	"effects":  true,
	"master":   true,
	"sample":   true,
	"test":     true,
	"dummy":    true,
	"tutorial": true,
}
