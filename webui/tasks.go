package webui

import (
	"errors"
	"fmt"
	"sync"
	"time"

	"vertesan/hailstorm/rich"
	"vertesan/hailstorm/runner"
)

type TaskStatus string

const (
	TaskRunning TaskStatus = "running"
	TaskSuccess TaskStatus = "success"
	TaskError   TaskStatus = "error"
)

type LogEntry struct {
	Time    string `json:"time"`
	Level   string `json:"level"`
	Message string `json:"message"`
}

type Task struct {
	ID        string     `json:"id"`
	Mode      string     `json:"mode"`
	Status    TaskStatus `json:"status"`
	StartedAt time.Time  `json:"startedAt"`
	EndedAt   time.Time  `json:"endedAt"`
	Err       string     `json:"error"`

	mu   sync.RWMutex
	logs []LogEntry
	subs map[chan LogEntry]struct{}
}

func NewTask(id string, mode string) *Task {
	return &Task{
		ID:        id,
		Mode:      mode,
		Status:    TaskRunning,
		StartedAt: time.Now(),
		subs:      make(map[chan LogEntry]struct{}),
	}
}

func (t *Task) AddLog(level string, message string) {
	entry := LogEntry{
		Time:    time.Now().Format(time.RFC3339),
		Level:   level,
		Message: message,
	}
	t.mu.Lock()
	t.logs = append(t.logs, entry)
	for ch := range t.subs {
		select {
		case ch <- entry:
		default:
		}
	}
	t.mu.Unlock()
}

func (t *Task) Logs() []LogEntry {
	t.mu.RLock()
	defer t.mu.RUnlock()
	copyLogs := make([]LogEntry, len(t.logs))
	copy(copyLogs, t.logs)
	return copyLogs
}

func (t *Task) Subscribe() chan LogEntry {
	ch := make(chan LogEntry, 128)
	t.mu.Lock()
	t.subs[ch] = struct{}{}
	t.mu.Unlock()
	return ch
}

func (t *Task) Unsubscribe(ch chan LogEntry) {
	t.mu.Lock()
	if _, ok := t.subs[ch]; ok {
		delete(t.subs, ch)
		close(ch)
	}
	t.mu.Unlock()
}

func (t *Task) CloseSubscribers() {
	t.mu.Lock()
	for ch := range t.subs {
		close(ch)
		delete(t.subs, ch)
	}
	t.mu.Unlock()
}

type TaskManager struct {
	mu      sync.RWMutex
	tasks   map[string]*Task
	active  *Task
	catalog *CatalogStore
}

func NewTaskManager(catalog *CatalogStore) *TaskManager {
	return &TaskManager{
		tasks:   make(map[string]*Task),
		catalog: catalog,
	}
}

func (m *TaskManager) Start(mode string, opts runner.Options) (*Task, error) {
	m.mu.Lock()
	if m.active != nil && m.active.Status == TaskRunning {
		m.mu.Unlock()
		return nil, errors.New("another task is already running")
	}
	id := fmt.Sprintf("%d", time.Now().UnixNano())
	task := NewTask(id, mode)
	m.tasks[id] = task
	m.active = task
	m.mu.Unlock()

	go func() {
		task.AddLog("info", "Task started.")
		rich.SetHook(func(level string, message string) {
			task.AddLog(level, message)
		})
		err := runner.Run(opts)
		rich.SetHook(nil)

		task.mu.Lock()
		if err != nil {
			task.Status = TaskError
			task.Err = err.Error()
		} else {
			task.Status = TaskSuccess
		}
		task.EndedAt = time.Now()
		task.mu.Unlock()

		if err != nil {
			task.AddLog("error", err.Error())
		} else {
			task.AddLog("info", "Task finished.")
		}

		task.CloseSubscribers()

		if m.catalog != nil {
			_ = m.catalog.Reload()
		}

		m.mu.Lock()
		if m.active == task {
			m.active = nil
		}
		m.mu.Unlock()
	}()

	return task, nil
}

func (m *TaskManager) Active() *Task {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.active
}

func (m *TaskManager) Get(id string) *Task {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.tasks[id]
}

func (m *TaskManager) List() []*Task {
	m.mu.RLock()
	defer m.mu.RUnlock()
	list := make([]*Task, 0, len(m.tasks))
	for _, task := range m.tasks {
		list = append(list, task)
	}
	return list
}
