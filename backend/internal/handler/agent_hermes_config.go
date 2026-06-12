package handler

import "strings"

func normalizeHermesProvider(provider string) string {
	normalized := strings.ToLower(strings.TrimSpace(provider))
	if normalized == "" {
		return "auto"
	}
	return normalized
}
