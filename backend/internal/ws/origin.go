package ws

import (
	"net/http"
	"net/url"
	"strings"
)

func CheckOrigin(allowedOrigins string, r *http.Request) bool {
	origin := strings.TrimSpace(r.Header.Get("Origin"))
	if origin == "" {
		return true
	}

	originURL, err := url.Parse(origin)
	if err != nil {
		return false
	}

	if originURL.Host == r.Host {
		return true
	}

	for _, allowed := range splitCSV(allowedOrigins) {
		if origin == allowed || originURL.Host == allowed {
			return true
		}
	}

	return false
}
