package kube

import (
	"net/url"
	"strings"

	"k8s.io/client-go/tools/clientcmd"
	clientcmdapi "k8s.io/client-go/tools/clientcmd/api"
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

	cfg, err := clientcmd.Load([]byte(rawKC))
	if err != nil {
		return ProxyAuth{}, err
	}

	ctxName := strings.TrimSpace(cfg.CurrentContext)
	if ctxName == "" {
		return ProxyAuth{}, nil
	}

	ctx := cfg.Contexts[ctxName]
	if ctx == nil {
		return ProxyAuth{}, nil
	}

	cluster := cfg.Clusters[ctx.Cluster]
	user := cfg.AuthInfos[ctx.AuthInfo]

	return ProxyAuth{
		Server: strings.TrimSpace(clusterServer(cluster)),
		Token:  strings.TrimSpace(authToken(user)),
	}, nil
}

func clusterServer(cluster *clientcmdapi.Cluster) string {
	if cluster == nil {
		return ""
	}
	return strings.TrimSpace(cluster.Server)
}

func authToken(user *clientcmdapi.AuthInfo) string {
	if user == nil {
		return ""
	}

	candidates := []string{
		user.Token,
	}

	if user.AuthProvider != nil {
		candidates = append(candidates,
			user.AuthProvider.Config["id-token"],
			user.AuthProvider.Config["access-token"],
		)
	}

	if user.Exec != nil {
		for _, env := range user.Exec.Env {
			if strings.Contains(strings.ToLower(strings.TrimSpace(env.Name)), "token") {
				candidates = append(candidates, env.Value)
			}
		}
	}

	for _, candidate := range candidates {
		if trimmed := strings.TrimSpace(candidate); trimmed != "" {
			return trimmed
		}
	}

	return ""
}
