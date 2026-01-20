package webui

import (
	"os"
	"sync"
	"time"

	"vertesan/hailstorm/manifest"
	"vertesan/hailstorm/runner"
	"vertesan/hailstorm/utils"
)

type CatalogStore struct {
	mu      sync.RWMutex
	entries []manifest.Entry
	modTime time.Time
	loaded  bool
}

func NewCatalogStore() *CatalogStore {
	return &CatalogStore{}
}

func (c *CatalogStore) Reload() error {
	info, err := os.Stat(runner.CatalogJsonFile)
	if err != nil {
		if os.IsNotExist(err) {
			c.mu.Lock()
			c.entries = nil
			c.modTime = time.Time{}
			c.loaded = false
			c.mu.Unlock()
			return nil
		}
		return err
	}

	c.mu.RLock()
	if c.loaded && info.ModTime().Equal(c.modTime) {
		c.mu.RUnlock()
		return nil
	}
	c.mu.RUnlock()

	entries := []manifest.Entry{}
	if err := utils.ReadFromJsonFile(runner.CatalogJsonFile, &entries); err != nil {
		return err
	}

	c.mu.Lock()
	c.entries = entries
	c.modTime = info.ModTime()
	c.loaded = true
	c.mu.Unlock()
	return nil
}

func (c *CatalogStore) Entries() []manifest.Entry {
	c.mu.RLock()
	defer c.mu.RUnlock()
	if len(c.entries) == 0 {
		return nil
	}
	copyEntries := make([]manifest.Entry, len(c.entries))
	copy(copyEntries, c.entries)
	return copyEntries
}

func (c *CatalogStore) Stats() (entries []manifest.Entry, modTime time.Time, loaded bool) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	copyEntries := make([]manifest.Entry, len(c.entries))
	copy(copyEntries, c.entries)
	return copyEntries, c.modTime, c.loaded
}
