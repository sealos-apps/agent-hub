package agent

import "regexp"

var agentNamePattern = regexp.MustCompile(`^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$`)

func ValidateName(name string) bool {
	return agentNamePattern.MatchString(name)
}
