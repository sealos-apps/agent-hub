package kube

import (
	"fmt"
	"net/url"
	"strings"

	"k8s.io/client-go/tools/clientcmd"
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

	cfg, err := clientcmd.Load([]byte(rawKC))
	if err != nil {
		return CurrentAuth{}, fmt.Errorf("failed to parse kubeconfig")
	}

	ctxName := strings.TrimSpace(cfg.CurrentContext)
	if ctxName == "" {
		return CurrentAuth{}, fmt.Errorf("kubeconfig current-context is empty")
	}

	ctx, ok := cfg.Contexts[ctxName]
	if !ok || ctx == nil {
		return CurrentAuth{}, fmt.Errorf("kubeconfig current-context %q not found", ctxName)
	}

	userName := strings.TrimSpace(ctx.AuthInfo)
	if userName == "" {
		return CurrentAuth{}, fmt.Errorf("kubeconfig current-context %q has empty user", ctxName)
	}

	authInfo, ok := cfg.AuthInfos[userName]
	if !ok || authInfo == nil {
		return CurrentAuth{}, fmt.Errorf("kubeconfig user %q not found", userName)
	}

	token := strings.TrimSpace(authInfo.Token)
	if token == "" {
		return CurrentAuth{}, fmt.Errorf("kubeconfig user %q has empty token", userName)
	}

	return CurrentAuth{
		UserName: userName,
		Token:    token,
	}, nil
}
