package kube

import (
	"net/url"
	"strings"
)

type ProxyAuth struct {
	Server string
	Token  string
}

func ParseProxyAuthFromEncodedKubeconfig(encodedKC string) (ProxyAuth, error) {
	rawKC, err := url.QueryUnescape(strings.TrimSpace(encodedKC))
	if err != nil {
		return ProxyAuth{}, err
	}
	if strings.TrimSpace(rawKC) == "" {
		return ProxyAuth{}, nil
	}

	clientConfig, err := parseSafeClientConfig([]byte(rawKC))
	if err != nil {
		return ProxyAuth{}, err
	}
	return ProxyAuth{
		Server: strings.TrimSpace(clientConfig.clusterServer),
		Token:  strings.TrimSpace(clientConfig.token),
	}, nil
}
