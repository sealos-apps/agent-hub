package kube

import (
	"fmt"
	"net/url"
	"strings"
)

type CurrentAuth struct {
	UserName string
	Token    string
}

func ParseCurrentAuthFromEncodedKubeconfig(encodedKC string) (CurrentAuth, error) {
	rawKC, err := url.QueryUnescape(strings.TrimSpace(encodedKC))
	if err != nil {
		return CurrentAuth{}, fmt.Errorf("invalid url-encoded kubeconfig")
	}
	if strings.TrimSpace(rawKC) == "" {
		return CurrentAuth{}, fmt.Errorf("empty kubeconfig")
	}

	clientConfig, err := parseSafeClientConfig([]byte(rawKC))
	if err != nil {
		return CurrentAuth{}, err
	}

	return CurrentAuth{
		UserName: strings.TrimSpace(clientConfig.userName),
		Token:    strings.TrimSpace(clientConfig.token),
	}, nil
}
