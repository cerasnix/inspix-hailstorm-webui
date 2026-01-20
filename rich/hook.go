package rich

import "sync"

type HookFunc func(level string, message string)

var (
	hookMu sync.RWMutex
	hookFn HookFunc
)

func SetHook(h HookFunc) {
	hookMu.Lock()
	hookFn = h
	hookMu.Unlock()
}

func emit(level string, message string) {
	hookMu.RLock()
	h := hookFn
	hookMu.RUnlock()
	if h != nil {
		h(level, message)
	}
}
