package kube

import (
	"fmt"
	"net/http"
	"net/url"
	"strings"

	appErr "github.com/nightwhite/Agent-Hub/pkg/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"
)

const DefaultAuthorizationHeader = "Authorization"
const WebSocketAuthorizationQueryParam = "authorization"

type Factory struct {
	restConfig *rest.Config
	namespace  string
}

func NewFactoryFromHeaders(header http.Header) (*Factory, *appErr.AppError) {
	encodedKC := strings.TrimSpace(header.Get(DefaultAuthorizationHeader))
	if encodedKC == "" {
		return nil, appErr.New(appErr.CodeMissingAuthorizationHeader, fmt.Sprintf("missing %s header", DefaultAuthorizationHeader)).WithDetails(map[string]any{
			"header": DefaultAuthorizationHeader,
			"reason": "required",
		})
	}

	return NewFactoryFromEncodedKubeconfig(encodedKC)
}

func NewFactoryFromEncodedKubeconfig(encodedKC string) (*Factory, *appErr.AppError) {
	rawKC, err := url.QueryUnescape(strings.TrimSpace(encodedKC))
	if err != nil {
		return nil, appErr.New(appErr.CodeInvalidAuthorizationHeader, "invalid url-encoded kubeconfig in Authorization header").WithDetails(map[string]any{
			"header": DefaultAuthorizationHeader,
			"reason": "invalid_url_encoding",
		})
	}
	if strings.TrimSpace(rawKC) == "" {
		return nil, appErr.New(appErr.CodeInvalidAuthorizationHeader, "empty kubeconfig in Authorization header").WithDetails(map[string]any{
			"header": DefaultAuthorizationHeader,
			"reason": "empty_kubeconfig",
		})
	}

	restConfig, err := clientcmd.RESTConfigFromKubeConfig([]byte(rawKC))
	if err != nil {
		return nil, appErr.New(appErr.CodeInvalidAuthorizationHeader, "failed to build client config from Authorization header kubeconfig").WithDetails(map[string]any{
			"header": DefaultAuthorizationHeader,
			"reason": "invalid_kubeconfig",
		})
	}

	namespace, err := namespaceFromKubeconfig([]byte(rawKC))
	if err != nil {
		return nil, appErr.New(appErr.CodeInvalidAuthorizationHeader, err.Error()).WithDetails(map[string]any{
			"header": DefaultAuthorizationHeader,
			"reason": "invalid_context_namespace",
		})
	}

	return &Factory{restConfig: restConfig, namespace: namespace}, nil
}

func namespaceFromKubeconfig(rawKC []byte) (string, error) {
	cfg, err := clientcmd.Load(rawKC)
	if err != nil {
		return "", fmt.Errorf("failed to parse kubeconfig from Authorization header")
	}

	ctxName := strings.TrimSpace(cfg.CurrentContext)
	if ctxName == "" {
		return "", fmt.Errorf("kubeconfig current-context is empty")
	}

	ctx, ok := cfg.Contexts[ctxName]
	if !ok || ctx == nil {
		return "", fmt.Errorf("kubeconfig current-context %q not found", ctxName)
	}

	namespace := strings.TrimSpace(ctx.Namespace)
	if namespace == "" {
		return "", fmt.Errorf("kubeconfig current-context %q has empty namespace", ctxName)
	}

	return namespace, nil
}

func (f *Factory) Namespace() string {
	return f.namespace
}

func (f *Factory) RESTConfig() *rest.Config {
	return rest.CopyConfig(f.restConfig)
}

func (f *Factory) ClusterServer() string {
	if f == nil || f.restConfig == nil {
		return ""
	}
	return strings.TrimSpace(f.restConfig.Host)
}

func (f *Factory) Kubernetes() (*kubernetes.Clientset, error) {
	return kubernetes.NewForConfig(f.restConfig)
}

func (f *Factory) Dynamic() (dynamic.Interface, error) {
	return dynamic.NewForConfig(f.restConfig)
}

func (f *Factory) ListOptionsByAgentName(agentName string) metav1.ListOptions {
	return metav1.ListOptions{LabelSelector: fmt.Sprintf("agent.sealos.io/name=%s", agentName)}
}
