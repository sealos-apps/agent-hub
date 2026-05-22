package handler

import (
	"context"
	"crypto/rand"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/http/httputil"
	"net/url"
	"path"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"

	"github.com/nightwhite/Agent-Hub/internal/kube"
	appErr "github.com/nightwhite/Agent-Hub/pkg/errors"
)

const defaultPreviewBasePath = "/__preview"
const defaultPreviewIdleTTL = 5 * time.Minute
const defaultPreviewCleanupInterval = time.Minute

var defaultPreviewManager = newPreviewManager(previewManagerOptions{
	basePath:         defaultPreviewBasePath,
	starter:          kubePreviewTunnelStarter{},
	idleTTL:          defaultPreviewIdleTTL,
	cleanupInterval:  defaultPreviewCleanupInterval,
	startCleanupLoop: true,
})

type createPreviewRequest struct {
	Port int `json:"port"`
}

type previewResponse struct {
	ID   string `json:"id"`
	Port int    `json:"port"`
	URL  string `json:"url"`
}

type kubePreviewTunnelStarter struct{}

type previewTunnelTarget struct {
	Namespace  string
	PodName    string
	Port       int
	Clientset  kubernetes.Interface
	RESTConfig *rest.Config
}

type previewTunnel interface {
	LocalURL() string
	Close()
}

type previewTunnelStarter interface {
	StartPreviewTunnel(context.Context, previewTunnelTarget) (previewTunnel, error)
}

type previewTunnelStarterFunc func(context.Context, previewTunnelTarget) (previewTunnel, error)

func (f previewTunnelStarterFunc) StartPreviewTunnel(ctx context.Context, target previewTunnelTarget) (previewTunnel, error) {
	return f(ctx, target)
}

type previewManagerOptions struct {
	basePath         string
	starter          previewTunnelStarter
	now              func() time.Time
	idleTTL          time.Duration
	cleanupInterval  time.Duration
	startCleanupLoop bool
}

type previewCreateOptions struct {
	agentName  string
	namespace  string
	podName    string
	port       int
	clientset  kubernetes.Interface
	restConfig *rest.Config
}

type previewSession struct {
	ID        string
	AgentName string
	Namespace string
	PodName   string
	Port      int
	URL       string
	Secret    string

	targetURL     *url.URL
	tunnel        previewTunnel
	lastHeartbeat time.Time
	lastRequest   time.Time
}

type previewManager struct {
	basePath string
	starter  previewTunnelStarter
	now      func() time.Time
	idleTTL  time.Duration

	mu       sync.RWMutex
	sessions map[string]*previewSession
}

func newPreviewManager(options previewManagerOptions) *previewManager {
	basePath := strings.TrimRight(strings.TrimSpace(options.basePath), "/")
	if basePath == "" {
		basePath = defaultPreviewBasePath
	}
	now := options.now
	if now == nil {
		now = time.Now
	}
	idleTTL := options.idleTTL
	if idleTTL <= 0 {
		idleTTL = defaultPreviewIdleTTL
	}
	manager := &previewManager{
		basePath: basePath,
		starter:  options.starter,
		now:      now,
		idleTTL:  idleTTL,
		sessions: map[string]*previewSession{},
	}
	if options.startCleanupLoop {
		interval := options.cleanupInterval
		if interval <= 0 {
			interval = defaultPreviewCleanupInterval
		}
		go manager.cleanupLoop(interval)
	}
	return manager
}

func CreateAgentPreview(c *gin.Context) {
	createAgentPreview(c, defaultPreviewManager)
}

func HeartbeatAgentPreview(c *gin.Context) {
	heartbeatAgentPreview(c, defaultPreviewManager)
}

func DeleteAgentPreview(c *gin.Context) {
	deleteAgentPreview(c, defaultPreviewManager)
}

func ProxyAgentPreview(c *gin.Context) {
	proxyAgentPreview(c, defaultPreviewManager)
}

func createAgentPreview(c *gin.Context, manager *previewManager) {
	var payload createPreviewRequest
	if err := json.NewDecoder(c.Request.Body).Decode(&payload); err != nil {
		if errors.Is(err, io.EOF) {
			writeAppError(c, http.StatusBadRequest, appErr.ErrInvalidJSON)
			return
		}
		writeAppError(c, http.StatusBadRequest, appErr.ErrInvalidJSON)
		return
	}
	if !validPreviewPort(payload.Port) {
		writeValidationError(c, appErr.New(appErr.CodeValidationFailed, "invalid preview port").WithDetails(map[string]any{
			"field":  "port",
			"reason": "must_be_between_1_and_65535",
		}))
		return
	}

	agentName := strings.TrimSpace(c.Param("agentName"))
	if agentName == "" {
		writeValidationError(c, appErr.New(appErr.CodeInvalidAgentName, "invalid agent name"))
		return
	}

	namespace, podName, ok := previewTargetFromContext(c)
	var clientset kubernetes.Interface
	var restConfig *rest.Config
	if !ok {
		factory, factoryErr := kubeFactory(c)
		if factoryErr != nil {
			writeHeaderKubeconfigError(c, factoryErr)
			return
		}
		resolvedClientset, err := factory.Kubernetes()
		if err != nil {
			writeAppError(c, http.StatusInternalServerError, appErr.New(appErr.CodeKubernetesOperation, "failed to build kubernetes clientset"))
			return
		}
		podRef, err := kube.ResolveAgentPod(c.Request.Context(), resolvedClientset, factory.Namespace(), agentName)
		if err != nil {
			writeAppError(c, http.StatusNotFound, appErr.New(appErr.CodeNotFound, err.Error()))
			return
		}
		namespace = factory.Namespace()
		podName = podRef.Name
		clientset = resolvedClientset
		restConfig = factory.RESTConfig()
	} else {
		clientset = previewClientsetFromContext(c)
		restConfig = previewRESTConfigFromContext(c)
	}

	session, err := manager.create(c.Request.Context(), previewCreateOptions{
		agentName:  agentName,
		namespace:  namespace,
		podName:    podName,
		port:       payload.Port,
		clientset:  clientset,
		restConfig: restConfig,
	})
	if err != nil {
		writeAppError(c, http.StatusBadGateway, appErr.New(appErr.CodeKubernetesOperation, "failed to create preview session").WithDetails(map[string]any{
			"reason": err.Error(),
		}))
		return
	}

	setPreviewSessionCookie(c, session)
	writeSuccess(c, http.StatusCreated, previewResponse{
		ID:   session.ID,
		Port: session.Port,
		URL:  session.URL,
	})
}

func heartbeatAgentPreview(c *gin.Context, manager *previewManager) {
	namespace, ok := previewNamespaceFromRequest(c)
	if !ok {
		return
	}
	if manager.heartbeat(c.Param("id"), c.Param("agentName"), namespace) {
		writeSuccess(c, http.StatusOK, map[string]any{"ok": true})
		return
	}
	writeAppError(c, http.StatusNotFound, appErr.New(appErr.CodeNotFound, "preview session not found"))
}

func deleteAgentPreview(c *gin.Context, manager *previewManager) {
	namespace, ok := previewNamespaceFromRequest(c)
	if !ok {
		return
	}
	session := manager.get(c.Param("id"), c.Param("agentName"), namespace)
	if session != nil {
		clearPreviewSessionCookie(c, session)
		manager.release(c.Param("id"), c.Param("agentName"), namespace)
	}
	c.Status(http.StatusNoContent)
}

func proxyAgentPreview(c *gin.Context, manager *previewManager) {
	manager.proxy(c.Writer, c.Request, c.Param("previewID"), c.Param("proxyPath"))
}

func previewClientsetFromContext(c *gin.Context) kubernetes.Interface {
	value, ok := c.Get("previewClientset")
	if !ok {
		return nil
	}
	clientset, _ := value.(kubernetes.Interface)
	return clientset
}

func previewRESTConfigFromContext(c *gin.Context) *rest.Config {
	value, ok := c.Get("previewRESTConfig")
	if !ok {
		return nil
	}
	restConfig, _ := value.(*rest.Config)
	return restConfig
}

func previewTargetFromContext(c *gin.Context) (namespace, podName string, ok bool) {
	namespaceValue, namespaceOK := c.Get("previewNamespace")
	podValue, podOK := c.Get("previewPodName")
	if !namespaceOK || !podOK {
		return "", "", false
	}
	namespace, _ = namespaceValue.(string)
	podName, _ = podValue.(string)
	namespace = strings.TrimSpace(namespace)
	podName = strings.TrimSpace(podName)
	return namespace, podName, namespace != "" && podName != ""
}

func previewNamespaceFromRequest(c *gin.Context) (string, bool) {
	if namespace, _, ok := previewTargetFromContext(c); ok {
		return namespace, true
	}
	if namespaceValue, ok := c.Get("previewNamespace"); ok {
		namespace, _ := namespaceValue.(string)
		namespace = strings.TrimSpace(namespace)
		if namespace != "" {
			return namespace, true
		}
	}
	factory, err := kubeFactory(c)
	if err != nil {
		writeHeaderKubeconfigError(c, err)
		return "", false
	}
	return factory.Namespace(), true
}

func validPreviewPort(port int) bool {
	return port >= 1 && port <= 65535
}

func (m *previewManager) create(ctx context.Context, options previewCreateOptions) (*previewSession, error) {
	if m == nil {
		return nil, errors.New("preview manager is unavailable")
	}
	if !validPreviewPort(options.port) {
		return nil, errors.New("invalid preview port")
	}
	if m.starter == nil {
		return nil, errors.New("preview tunnel starter is unavailable")
	}

	tunnel, err := m.starter.StartPreviewTunnel(ctx, previewTunnelTarget{
		Namespace:  options.namespace,
		PodName:    options.podName,
		Port:       options.port,
		Clientset:  options.clientset,
		RESTConfig: options.restConfig,
	})
	if err != nil {
		return nil, err
	}

	targetURL, err := url.Parse(strings.TrimSpace(tunnel.LocalURL()))
	if err != nil || targetURL.Scheme == "" || targetURL.Host == "" {
		tunnel.Close()
		return nil, errors.New("invalid preview tunnel url")
	}

	previewID, err := newPreviewID()
	if err != nil {
		tunnel.Close()
		return nil, err
	}
	secret, err := newPreviewSecret()
	if err != nil {
		tunnel.Close()
		return nil, err
	}

	session := &previewSession{
		ID:            previewID,
		AgentName:     strings.TrimSpace(options.agentName),
		Namespace:     strings.TrimSpace(options.namespace),
		PodName:       strings.TrimSpace(options.podName),
		Port:          options.port,
		Secret:        secret,
		targetURL:     targetURL,
		tunnel:        tunnel,
		lastHeartbeat: m.now(),
		lastRequest:   m.now(),
	}
	session.URL = m.basePath + "/" + session.ID + "/"

	m.mu.Lock()
	m.sessions[session.ID] = session
	m.mu.Unlock()

	return session, nil
}

func (m *previewManager) release(id, agentName, namespace string) bool {
	if m == nil {
		return false
	}

	m.mu.Lock()
	session := m.sessions[strings.TrimSpace(id)]
	if session != nil && session.matches(agentName, namespace) {
		delete(m.sessions, session.ID)
	} else {
		session = nil
	}
	m.mu.Unlock()

	if session == nil {
		return false
	}
	session.tunnel.Close()
	return true
}

func (m *previewManager) heartbeat(id, agentName, namespace string) bool {
	if m == nil {
		return false
	}

	m.mu.Lock()
	defer m.mu.Unlock()

	session := m.sessions[strings.TrimSpace(id)]
	if session == nil || !session.matches(agentName, namespace) {
		return false
	}
	session.lastHeartbeat = m.now()
	return true
}

func (m *previewManager) proxy(writer http.ResponseWriter, request *http.Request, id, proxyPath string) {
	session := m.markRequest(id, previewCookieValue(request, id))
	if session == nil {
		http.NotFound(writer, request)
		return
	}

	targetURL := *session.targetURL
	targetPath := "/" + strings.TrimLeft(proxyPath, "/")
	if targetPath == "/" {
		targetPath = "/"
	}
	basePath := session.URL

	proxy := &httputil.ReverseProxy{
		FlushInterval: -1,
		ErrorHandler:  previewErrorHandler,
		Director: func(req *http.Request) {
			req.URL.Scheme = targetURL.Scheme
			req.URL.Host = targetURL.Host
			req.URL.Path = path.Clean(targetPath)
			if strings.HasSuffix(targetPath, "/") && !strings.HasSuffix(req.URL.Path, "/") {
				req.URL.Path += "/"
			}
			req.URL.RawQuery = request.URL.RawQuery
			req.Host = targetURL.Host
			req.Header.Set("Accept-Encoding", "identity")
			stripRequestCookie(req, session.cookieName())
		},
		ModifyResponse: func(resp *http.Response) error {
			return rewritePreviewHTMLResponse(resp, basePath)
		},
	}
	proxy.ServeHTTP(writer, request)
}

func (m *previewManager) get(id, agentName, namespace string) *previewSession {
	if m == nil {
		return nil
	}

	m.mu.RLock()
	defer m.mu.RUnlock()

	session := m.sessions[strings.TrimSpace(id)]
	if session == nil || !session.matches(agentName, namespace) {
		return nil
	}
	return session
}

func (m *previewManager) markRequest(id, secret string) *previewSession {
	if m == nil {
		return nil
	}

	m.mu.Lock()
	defer m.mu.Unlock()

	session := m.sessions[strings.TrimSpace(id)]
	if session == nil || !previewSecretsEqual(secret, session.Secret) {
		return nil
	}
	session.lastRequest = m.now()
	return session
}

func (m *previewManager) expireIdleSessions() int {
	if m == nil || m.idleTTL <= 0 {
		return 0
	}

	now := m.now()
	expired := make([]*previewSession, 0)

	m.mu.Lock()
	for id, session := range m.sessions {
		lastActive := session.lastHeartbeat
		if session.lastRequest.After(lastActive) {
			lastActive = session.lastRequest
		}
		if now.Sub(lastActive) <= m.idleTTL {
			continue
		}
		delete(m.sessions, id)
		expired = append(expired, session)
	}
	m.mu.Unlock()

	for _, session := range expired {
		session.tunnel.Close()
	}
	return len(expired)
}

func (m *previewManager) cleanupLoop(interval time.Duration) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for range ticker.C {
		m.expireIdleSessions()
	}
}

func newPreviewID() (string, error) {
	return newPreviewIDFromReader(rand.Reader)
}

func newPreviewSecret() (string, error) {
	return newPreviewSecretFromReader(rand.Reader)
}

func newPreviewIDFromReader(reader io.Reader) (string, error) {
	var buffer [16]byte
	if _, err := io.ReadFull(reader, buffer[:]); err != nil {
		return "", err
	}
	return "p_" + hex.EncodeToString(buffer[:]), nil
}

func newPreviewSecretFromReader(reader io.Reader) (string, error) {
	var buffer [32]byte
	if _, err := io.ReadFull(reader, buffer[:]); err != nil {
		return "", err
	}
	return hex.EncodeToString(buffer[:]), nil
}

func (s *previewSession) matches(agentName, namespace string) bool {
	if s == nil {
		return false
	}
	return s.AgentName == strings.TrimSpace(agentName) && s.Namespace == strings.TrimSpace(namespace)
}

func (s *previewSession) cookieName() string {
	if s == nil {
		return ""
	}
	return "agenthub_preview_" + s.ID
}

func setPreviewSessionCookie(c *gin.Context, session *previewSession) {
	http.SetCookie(c.Writer, previewSessionCookie(c.Request, session, session.Secret, 0))
}

func clearPreviewSessionCookie(c *gin.Context, session *previewSession) {
	http.SetCookie(c.Writer, previewSessionCookie(c.Request, session, "", -1))
}

func previewSessionCookie(request *http.Request, session *previewSession, value string, maxAge int) *http.Cookie {
	pathValue := strings.TrimRight(session.URL, "/")
	cookie := &http.Cookie{
		Name:     session.cookieName(),
		Value:    value,
		Path:     pathValue,
		HttpOnly: true,
		SameSite: http.SameSiteStrictMode,
		MaxAge:   maxAge,
	}
	if request != nil && (request.TLS != nil || strings.EqualFold(request.Header.Get("X-Forwarded-Proto"), "https")) {
		cookie.Secure = true
	}
	return cookie
}

func previewCookieValue(request *http.Request, id string) string {
	if request == nil {
		return ""
	}
	cookie, err := request.Cookie("agenthub_preview_" + strings.TrimSpace(id))
	if err != nil {
		return ""
	}
	return cookie.Value
}

func stripRequestCookie(request *http.Request, name string) {
	if request == nil || strings.TrimSpace(name) == "" {
		return
	}
	cookies := request.Cookies()
	request.Header.Del("Cookie")
	for _, cookie := range cookies {
		if cookie.Name == name {
			continue
		}
		request.AddCookie(cookie)
	}
}

func previewSecretsEqual(candidate, expected string) bool {
	if candidate == "" || expected == "" || len(candidate) != len(expected) {
		return false
	}
	return subtle.ConstantTimeCompare([]byte(candidate), []byte(expected)) == 1
}

func rewritePreviewHTMLResponse(resp *http.Response, basePath string) error {
	if resp == nil || resp.Body == nil || !strings.HasPrefix(strings.ToLower(resp.Header.Get("Content-Type")), "text/html") {
		return nil
	}
	body, err := io.ReadAll(resp.Body)
	_ = resp.Body.Close()
	if err != nil {
		return err
	}
	rewritten := rewritePreviewHTMLRootPaths(string(body), basePath)
	resp.Body = io.NopCloser(strings.NewReader(rewritten))
	resp.ContentLength = int64(len(rewritten))
	resp.Header.Set("Content-Length", fmt.Sprintf("%d", len(rewritten)))
	return nil
}

func rewritePreviewHTMLRootPaths(body, basePath string) string {
	prefix := strings.TrimRight(basePath, "/")
	replacer := strings.NewReplacer(
		`src="/`, `src="`+prefix+`/`,
		`href="/`, `href="`+prefix+`/`,
		`action="/`, `action="`+prefix+`/`,
	)
	return replacer.Replace(body)
}

func (kubePreviewTunnelStarter) StartPreviewTunnel(ctx context.Context, target previewTunnelTarget) (previewTunnel, error) {
	return kube.StartPodPortForward(ctx, kube.PodPortForwardOptions{
		Namespace:  strings.TrimSpace(target.Namespace),
		PodName:    strings.TrimSpace(target.PodName),
		Port:       target.Port,
		Clientset:  target.Clientset,
		RESTConfig: target.RESTConfig,
	})
}

func previewErrorHandler(writer http.ResponseWriter, _ *http.Request, err error) {
	if err != nil {
		log.Printf("preview proxy error: %v", err)
	}
	http.Error(writer, fmt.Sprintf("%s", http.StatusText(http.StatusBadGateway)), http.StatusBadGateway)
}
