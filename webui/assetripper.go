package webui

import (
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"vertesan/hailstorm/runtimecfg"
)

const assetRipperDirEnv = "ASSETRIPPER_DIR"
const assetRipperDefaultPort = 23600

type AssetRipperService struct {
	mu      sync.Mutex
	dir     string
	binPath string
	port    int
	baseURL string
	cmd     *exec.Cmd
}

var assetRipperService = &AssetRipperService{}

func assetRipperConfigured() bool {
	return configuredAssetRipperDir() != ""
}

func ensureAssetRipperRunning() error {
	return assetRipperService.EnsureRunning()
}

func assetRipperExport(inputPath, outputDir string) error {
	return assetRipperService.Export(inputPath, outputDir)
}

func (s *AssetRipperService) EnsureRunning() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.ensureRunningLocked()
}

func (s *AssetRipperService) ensureRunningLocked() error {
	dir := configuredAssetRipperDir()
	if dir == "" {
		return errors.New("assetripper dir not configured")
	}

	binPath, err := resolveAssetRipperBinary(dir)
	if err != nil {
		return err
	}

	port := assetRipperDefaultPort
	baseURL := fmt.Sprintf("http://127.0.0.1:%d", port)

	if s.baseURL == baseURL && s.binPath == binPath {
		if pingAssetRipper(baseURL, 2*time.Second) == nil {
			return nil
		}
	}

	if pingAssetRipper(baseURL, 2*time.Second) == nil {
		debugLog("AssetRipper already running at %s", baseURL)
		s.dir = dir
		s.binPath = binPath
		s.port = port
		s.baseURL = baseURL
		return nil
	}

	cmd := exec.Command(binPath, "--headless", "--port", strconv.Itoa(port))
	cmd.Dir = filepath.Dir(binPath)
	if DebugEnabled() {
		cmd.Stdout = os.Stdout
		cmd.Stderr = os.Stderr
	}
	if err := cmd.Start(); err != nil {
		return err
	}
	debugLog("AssetRipper started pid=%d port=%d", cmd.Process.Pid, port)

	if err := waitForAssetRipper(baseURL, 10*time.Second); err != nil {
		return err
	}

	s.dir = dir
	s.binPath = binPath
	s.port = port
	s.baseURL = baseURL
	s.cmd = cmd
	return nil
}

func (s *AssetRipperService) Export(inputPath, outputDir string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if err := s.ensureRunningLocked(); err != nil {
		return err
	}

	client := &http.Client{
		Timeout: 30 * time.Minute,
	}

	absInput := absPath(inputPath)
	absOutput := absPath(outputDir)
	debugLog("AssetRipper export input=%s output=%s", absInput, absOutput)
	if err := postAssetRipperForm(client, s.baseURL+"/LoadFile", absInput); err != nil {
		return err
	}
	if err := postAssetRipperForm(client, s.baseURL+"/Export/PrimaryContent", absOutput); err != nil {
		return err
	}
	return nil
}

func resolveAssetRipperBinary(dir string) (string, error) {
	info, err := os.Stat(dir)
	if err != nil {
		return "", err
	}
	if !info.IsDir() {
		return dir, nil
	}

	candidates := []string{
		"AssetRipper.GUI.Free",
		"AssetRipper.GUI.Premium",
		"AssetRipper.GUI.Free.exe",
		"AssetRipper.GUI.Premium.exe",
	}
	for _, name := range candidates {
		path := filepath.Join(dir, name)
		if fileExists(path) {
			return path, nil
		}
	}
	return "", fmt.Errorf("AssetRipper GUI binary not found in %s", dir)
}

func pingAssetRipper(baseURL string, timeout time.Duration) error {
	client := &http.Client{Timeout: timeout}
	resp, err := client.Get(baseURL + "/")
	if err != nil {
		return err
	}
	_ = resp.Body.Close()
	if resp.StatusCode >= 500 {
		return fmt.Errorf("status %d", resp.StatusCode)
	}
	return nil
}

func waitForAssetRipper(baseURL string, timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if err := pingAssetRipper(baseURL, 2*time.Second); err == nil {
			return nil
		}
		time.Sleep(250 * time.Millisecond)
	}
	return fmt.Errorf("assetripper not ready on %s", baseURL)
}

func postAssetRipperForm(client *http.Client, urlStr string, path string) error {
	values := url.Values{}
	values.Set("Path", path)
	resp, err := client.PostForm(urlStr, values)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 2048))
		msg := strings.TrimSpace(string(body))
		if msg == "" {
			msg = resp.Status
		}
		return fmt.Errorf("assetripper request failed: %s", msg)
	}
	return nil
}

func absPath(path string) string {
	if path == "" {
		return path
	}
	abs, err := filepath.Abs(path)
	if err != nil {
		return path
	}
	return abs
}

func configuredAssetRipperDir() string {
	if cfg, err := runtimecfg.Load(); err == nil {
		if dir := strings.TrimSpace(cfg.AssetRipperDir); dir != "" {
			return dir
		}
	}
	return strings.TrimSpace(os.Getenv(assetRipperDirEnv))
}
