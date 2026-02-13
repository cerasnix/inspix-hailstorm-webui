package webui

import (
	"fmt"
	"strings"
	"sync"
	"time"
)

type PreviewExportTaskStatus string

const (
	PreviewExportRunning PreviewExportTaskStatus = "running"
	PreviewExportSuccess PreviewExportTaskStatus = "success"
	PreviewExportError   PreviewExportTaskStatus = "error"
)

type PreviewExportTaskSnapshot struct {
	ID        string                  `json:"id"`
	Label     string                  `json:"label"`
	Kind      string                  `json:"kind"`
	Status    PreviewExportTaskStatus `json:"status"`
	Phase     string                  `json:"phase"`
	Message   string                  `json:"message"`
	Percent   float64                 `json:"percent"`
	StartedAt string                  `json:"startedAt"`
	UpdatedAt string                  `json:"updatedAt"`
	EndedAt   string                  `json:"endedAt,omitempty"`
	Error     string                  `json:"error,omitempty"`
	Preview   map[string]any          `json:"preview,omitempty"`
}

type PreviewExportTask struct {
	ID      string
	Label   string
	Kind    string
	Status  PreviewExportTaskStatus
	Phase   string
	Message string
	Percent float64
	Err     string

	StartedAt time.Time
	UpdatedAt time.Time
	EndedAt   time.Time
	Preview   PreviewInfo

	mu sync.RWMutex
}

type PreviewExportManager struct {
	mu             sync.RWMutex
	tasks          map[string]*PreviewExportTask
	runningByLabel map[string]string
}

func NewPreviewExportManager() *PreviewExportManager {
	return &PreviewExportManager{
		tasks:          make(map[string]*PreviewExportTask),
		runningByLabel: make(map[string]string),
	}
}

func (m *PreviewExportManager) Start(
	label string,
	kind string,
	run func(report PreviewProgressReporter) (PreviewInfo, error),
) (*PreviewExportTask, bool) {
	label = strings.TrimSpace(label)
	kind = strings.TrimSpace(kind)

	m.mu.Lock()
	if id, ok := m.runningByLabel[label]; ok {
		if task := m.tasks[id]; task != nil && task.IsRunning() {
			m.mu.Unlock()
			return task, true
		}
		delete(m.runningByLabel, label)
	}

	now := time.Now()
	id := fmt.Sprintf("px-%d", now.UnixNano())
	task := &PreviewExportTask{
		ID:        id,
		Label:     label,
		Kind:      kind,
		Status:    PreviewExportRunning,
		Phase:     "queued",
		Message:   "",
		Percent:   1,
		StartedAt: now,
		UpdatedAt: now,
	}
	m.tasks[id] = task
	m.runningByLabel[label] = id
	m.mu.Unlock()

	go m.execute(task, run)
	return task, false
}

func (m *PreviewExportManager) Get(id string) *PreviewExportTask {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.tasks[id]
}

func (m *PreviewExportManager) execute(
	task *PreviewExportTask,
	run func(report PreviewProgressReporter) (PreviewInfo, error),
) {
	done := make(chan struct{})
	ticker := time.NewTicker(900 * time.Millisecond)
	defer ticker.Stop()

	go func() {
		for {
			select {
			case <-done:
				return
			case <-ticker.C:
				task.Pulse(0.7)
			}
		}
	}()

	preview, err := run(func(percent float64, phase string, message string) {
		task.Report(percent, phase, message)
	})
	close(done)

	if err != nil {
		task.Fail(err)
	} else {
		task.Complete(preview)
	}

	m.mu.Lock()
	if id, ok := m.runningByLabel[task.Label]; ok && id == task.ID {
		delete(m.runningByLabel, task.Label)
	}
	m.mu.Unlock()
}

func (t *PreviewExportTask) IsRunning() bool {
	t.mu.RLock()
	defer t.mu.RUnlock()
	return t.Status == PreviewExportRunning
}

func (t *PreviewExportTask) Report(percent float64, phase string, message string) {
	t.mu.Lock()
	defer t.mu.Unlock()

	if t.Status != PreviewExportRunning {
		return
	}
	if percent < 0 {
		percent = 0
	}
	if percent > 99 {
		percent = 99
	}
	if percent > t.Percent {
		t.Percent = percent
	}
	if phase = strings.TrimSpace(phase); phase != "" {
		t.Phase = phase
	}
	t.Message = strings.TrimSpace(message)
	t.UpdatedAt = time.Now()
}

func (t *PreviewExportTask) Pulse(delta float64) {
	t.mu.Lock()
	defer t.mu.Unlock()

	if t.Status != PreviewExportRunning {
		return
	}
	if delta <= 0 {
		delta = 0.3
	}
	next := t.Percent + delta
	if next > 95 {
		next = 95
	}
	if next > t.Percent {
		t.Percent = next
		t.UpdatedAt = time.Now()
	}
}

func (t *PreviewExportTask) Complete(preview PreviewInfo) {
	t.mu.Lock()
	defer t.mu.Unlock()
	if t.Status != PreviewExportRunning {
		return
	}
	now := time.Now()
	t.Status = PreviewExportSuccess
	t.Phase = "done"
	t.Message = ""
	t.Percent = 100
	t.Preview = preview
	t.UpdatedAt = now
	t.EndedAt = now
}

func (t *PreviewExportTask) Fail(err error) {
	t.mu.Lock()
	defer t.mu.Unlock()
	if t.Status != PreviewExportRunning {
		return
	}
	now := time.Now()
	t.Status = PreviewExportError
	t.Phase = "error"
	t.Message = ""
	t.Err = strings.TrimSpace(err.Error())
	t.UpdatedAt = now
	t.EndedAt = now
}

func (t *PreviewExportTask) Snapshot() PreviewExportTaskSnapshot {
	t.mu.RLock()
	defer t.mu.RUnlock()

	ended := ""
	if !t.EndedAt.IsZero() {
		ended = t.EndedAt.Format(time.RFC3339)
	}
	snap := PreviewExportTaskSnapshot{
		ID:        t.ID,
		Label:     t.Label,
		Kind:      t.Kind,
		Status:    t.Status,
		Phase:     t.Phase,
		Message:   t.Message,
		Percent:   t.Percent,
		StartedAt: t.StartedAt.Format(time.RFC3339),
		UpdatedAt: t.UpdatedAt.Format(time.RFC3339),
		EndedAt:   ended,
		Error:     t.Err,
	}
	if t.Status == PreviewExportSuccess {
		snap.Preview = previewPayload(t.Preview)
	}
	return snap
}
