package handler

import (
	"net/url"
	"testing"
)

func TestIsAllowedK8sProxyTarget(t *testing.T) {
	t.Parallel()

	cases := map[string]struct {
		rawURL     string
		allowHosts []string
		want       bool
	}{
		"allow exact host": {
			rawURL:     "https://usw-1.sealos.io:6443",
			allowHosts: []string{"usw-1.sealos.io"},
			want:       true,
		},
		"allow suffix host": {
			rawURL:     "https://foo.usw-1.sealos.io:6443",
			allowHosts: []string{".sealos.io"},
			want:       true,
		},
		"disallow http scheme": {
			rawURL:     "http://usw-1.sealos.io:6443",
			allowHosts: []string{".sealos.io"},
			want:       false,
		},
		"disallow unknown host": {
			rawURL:     "https://evil.local:6443",
			allowHosts: []string{".sealos.io", ".sealos.run"},
			want:       false,
		},
		"allow root suffix host itself": {
			rawURL:     "https://sealos.run:6443",
			allowHosts: []string{".sealos.run"},
			want:       true,
		},
	}

	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			parsed, err := url.Parse(tc.rawURL)
			if err != nil {
				t.Fatalf("url.Parse(%q) error = %v", tc.rawURL, err)
			}

			if got := isAllowedK8sProxyTarget(parsed, tc.allowHosts); got != tc.want {
				t.Fatalf("isAllowedK8sProxyTarget(%q, %v) = %v, want %v", tc.rawURL, tc.allowHosts, got, tc.want)
			}
		})
	}
}

