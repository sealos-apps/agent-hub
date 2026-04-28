package agent

type Status string

const (
	StatusCreating Status = "Creating"
	StatusRunning  Status = "Running"
	StatusPaused   Status = "Paused"
	StatusStarting Status = "Starting"
	StatusStopping Status = "Stopping"
	StatusUpdating Status = "Updating"
	StatusFailed   Status = "Failed"
	StatusDeleting Status = "Deleting"
)
