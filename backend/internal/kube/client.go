package kube

import (
	"fmt"
	"net"
	"net/http"
	"net/url"
	"os"
	"strings"

	appErr "github.com/nightwhite/Agent-Hub/pkg/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"
)

const DefaultAuthorizationHeader = "Authorization"

type Factory struct {
	restConfig    *rest.Config
	namespace     string
	clusterServer string
}

type safeClientConfig struct {
	restConfig    *rest.Config
	namespace     string
	clusterServer string
	userName      string
	token         string
}

type safeKubeconfigAuth struct {
	clusterServer string
	userName      string
	token         string
	caData        []byte
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

	clientConfig, err := parseSafeClientConfig([]byte(rawKC))
	if err != nil {
		return nil, appErr.New(appErr.CodeInvalidAuthorizationHeader, err.Error()).WithDetails(map[string]any{
			"header": DefaultAuthorizationHeader,
			"reason": "invalid_kubeconfig",
		})
	}

	return &Factory{restConfig: clientConfig.restConfig, namespace: clientConfig.namespace, clusterServer: clientConfig.clusterServer}, nil
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

func parseSafeClientConfig(rawKC []byte) (safeClientConfig, error) {
	cfg, err := clientcmd.Load(rawKC)
	if err != nil {
		return safeClientConfig{}, fmt.Errorf("failed to parse kubeconfig from Authorization header")
	}

	ctxName := strings.TrimSpace(cfg.CurrentContext)
	if ctxName == "" {
		return safeClientConfig{}, fmt.Errorf("kubeconfig current-context is empty")
	}

	ctx, ok := cfg.Contexts[ctxName]
	if !ok || ctx == nil {
		return safeClientConfig{}, fmt.Errorf("kubeconfig current-context %q not found", ctxName)
	}

	namespace := strings.TrimSpace(ctx.Namespace)
	if namespace == "" {
		return safeClientConfig{}, fmt.Errorf("kubeconfig current-context %q has empty namespace", ctxName)
	}

	auth, err := parseSafeKubeconfigAuth(rawKC)
	if err != nil {
		return safeClientConfig{}, err
	}

	return safeClientConfig{
		restConfig: &rest.Config{
			Host:        preferredAPIServerHost(auth.clusterServer),
			BearerToken: auth.token,
			TLSClientConfig: rest.TLSClientConfig{
				CAData:   append([]byte(nil), auth.caData...),
				Insecure: false,
			},
		},
		namespace:     namespace,
		clusterServer: auth.clusterServer,
		userName:      auth.userName,
		token:         auth.token,
	}, nil
}

func parseSafeKubeconfigAuth(rawKC []byte) (safeKubeconfigAuth, error) {
	cfg, err := clientcmd.Load(rawKC)
	if err != nil {
		return safeKubeconfigAuth{}, fmt.Errorf("failed to parse kubeconfig from Authorization header")
	}

	ctxName := strings.TrimSpace(cfg.CurrentContext)
	if ctxName == "" {
		return safeKubeconfigAuth{}, fmt.Errorf("kubeconfig current-context is empty")
	}

	ctx, ok := cfg.Contexts[ctxName]
	if !ok || ctx == nil {
		return safeKubeconfigAuth{}, fmt.Errorf("kubeconfig current-context %q not found", ctxName)
	}

	clusterName := strings.TrimSpace(ctx.Cluster)
	if clusterName == "" {
		return safeKubeconfigAuth{}, fmt.Errorf("kubeconfig current-context %q has empty cluster", ctxName)
	}
	cluster := cfg.Clusters[clusterName]
	if cluster == nil {
		return safeKubeconfigAuth{}, fmt.Errorf("kubeconfig cluster %q not found", clusterName)
	}

	userName := strings.TrimSpace(ctx.AuthInfo)
	if userName == "" {
		return safeKubeconfigAuth{}, fmt.Errorf("kubeconfig current-context %q has empty user", ctxName)
	}
	user := cfg.AuthInfos[userName]
	if user == nil {
		return safeKubeconfigAuth{}, fmt.Errorf("kubeconfig user %q not found", userName)
	}

	if user.Exec != nil {
		return safeKubeconfigAuth{}, fmt.Errorf("kubeconfig user %q exec credential plugins are not allowed", userName)
	}
	if user.AuthProvider != nil {
		return safeKubeconfigAuth{}, fmt.Errorf("kubeconfig user %q auth-provider plugins are not allowed", userName)
	}
	if strings.TrimSpace(user.TokenFile) != "" {
		return safeKubeconfigAuth{}, fmt.Errorf("kubeconfig user %q tokenFile is not allowed", userName)
	}
	if strings.TrimSpace(user.ClientCertificate) != "" || strings.TrimSpace(user.ClientKey) != "" {
		return safeKubeconfigAuth{}, fmt.Errorf("kubeconfig user %q client certificate file references are not allowed", userName)
	}
	if len(user.ClientCertificateData) > 0 || len(user.ClientKeyData) > 0 {
		return safeKubeconfigAuth{}, fmt.Errorf("kubeconfig user %q client certificate data is not allowed", userName)
	}
	if strings.TrimSpace(user.Username) != "" || strings.TrimSpace(user.Password) != "" {
		return safeKubeconfigAuth{}, fmt.Errorf("kubeconfig user %q basic auth is not allowed", userName)
	}
	if hasImpersonation(user.Impersonate, user.ImpersonateUID, user.ImpersonateGroups, user.ImpersonateUserExtra) {
		return safeKubeconfigAuth{}, fmt.Errorf("kubeconfig user %q impersonation is not allowed", userName)
	}

	token := strings.TrimSpace(user.Token)
	if token == "" {
		return safeKubeconfigAuth{}, fmt.Errorf("kubeconfig user %q has empty token", userName)
	}

	if cluster.InsecureSkipTLSVerify {
		return safeKubeconfigAuth{}, fmt.Errorf("kubeconfig cluster %q insecure-skip-tls-verify is not allowed", clusterName)
	}
	if strings.TrimSpace(cluster.CertificateAuthority) != "" {
		return safeKubeconfigAuth{}, fmt.Errorf("kubeconfig cluster %q certificate-authority file references are not allowed", clusterName)
	}
	if strings.TrimSpace(cluster.ProxyURL) != "" {
		return safeKubeconfigAuth{}, fmt.Errorf("kubeconfig cluster %q proxy-url is not allowed", clusterName)
	}
	if strings.TrimSpace(cluster.TLSServerName) != "" {
		return safeKubeconfigAuth{}, fmt.Errorf("kubeconfig cluster %q tls-server-name is not allowed", clusterName)
	}

	clusterServer := strings.TrimSpace(cluster.Server)
	if clusterServer == "" {
		return safeKubeconfigAuth{}, fmt.Errorf("kubeconfig cluster %q has empty server", clusterName)
	}
	parsedServer, err := url.Parse(clusterServer)
	if err != nil || parsedServer.Scheme == "" || parsedServer.Host == "" {
		return safeKubeconfigAuth{}, fmt.Errorf("kubeconfig cluster %q has invalid server", clusterName)
	}
	if !strings.EqualFold(parsedServer.Scheme, "https") {
		return safeKubeconfigAuth{}, fmt.Errorf("kubeconfig cluster %q server must use https", clusterName)
	}

	return safeKubeconfigAuth{
		clusterServer: clusterServer,
		userName:      userName,
		token:         token,
		caData:        append([]byte(nil), cluster.CertificateAuthorityData...),
	}, nil
}

func hasImpersonation(userName, uid string, groups []string, extra map[string][]string) bool {
	if strings.TrimSpace(userName) != "" || strings.TrimSpace(uid) != "" {
		return true
	}
	if len(groups) > 0 || len(extra) > 0 {
		return true
	}
	return false
}

func (f *Factory) Namespace() string {
	return f.namespace
}

func (f *Factory) RESTConfig() *rest.Config {
	return rest.CopyConfig(f.restConfig)
}

func (f *Factory) ClusterServer() string {
	if f == nil {
		return ""
	}
	if strings.TrimSpace(f.clusterServer) != "" {
		return strings.TrimSpace(f.clusterServer)
	}
	if f.restConfig == nil {
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

func preferredAPIServerHost(fallback string) string {
	serviceHost := strings.TrimSpace(os.Getenv("KUBERNETES_SERVICE_HOST"))
	if serviceHost == "" {
		return strings.TrimSpace(fallback)
	}
	servicePort := strings.TrimSpace(os.Getenv("KUBERNETES_SERVICE_PORT"))
	if servicePort == "" {
		servicePort = "443"
	}
	return "https://" + net.JoinHostPort(serviceHost, servicePort)
}
