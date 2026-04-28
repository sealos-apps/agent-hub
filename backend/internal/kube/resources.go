package kube

import (
	"bytes"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"text/template"

	"github.com/nightwhite/Agent-Hub/internal/agent"
	corev1 "k8s.io/api/core/v1"
	networkingv1 "k8s.io/api/networking/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"sigs.k8s.io/yaml"
)

type ResourceObjects struct {
	Devbox  *unstructured.Unstructured
	Service *corev1.Service
	Ingress *networkingv1.Ingress
}

type BuildOptions struct {
	IngressDomain string
	Image         string
	TemplateDir   string
}

type manifestTemplateData struct {
	Agent              agent.Agent
	Image              string
	IngressDomain      string
	DevboxLabels       map[string]string
	ServiceLabels      map[string]string
	IngressLabels      map[string]string
	SelectorLabels     map[string]string
	DevboxAnnotations  map[string]string
	ServiceAnnotations map[string]string
	IngressAnnotations map[string]string
}

const manifestTemplateRoot = "template/hermes-agent/manifests"

func Build(agentSpec agent.Agent, options BuildOptions) (ResourceObjects, error) {
	data := buildManifestTemplateData(agentSpec, options)
	templateDir, err := resolveManifestTemplateDir(options.TemplateDir)
	if err != nil {
		return ResourceObjects{}, err
	}

	devboxObject, err := renderUnstructuredManifest(filepath.Join(templateDir, "devbox.yaml.tmpl"), data)
	if err != nil {
		return ResourceObjects{}, err
	}

	service := &corev1.Service{}
	if err := renderTypedManifest(filepath.Join(templateDir, "service.yaml.tmpl"), data, service); err != nil {
		return ResourceObjects{}, err
	}

	ingress := &networkingv1.Ingress{}
	if err := renderTypedManifest(filepath.Join(templateDir, "ingress.yaml.tmpl"), data, ingress); err != nil {
		return ResourceObjects{}, err
	}

	return ResourceObjects{
		Devbox:  &unstructured.Unstructured{Object: devboxObject},
		Service: service,
		Ingress: ingress,
	}, nil
}

func buildManifestTemplateData(agentSpec agent.Agent, options BuildOptions) manifestTemplateData {
	labels := Labels(agentSpec)
	selectorLabels := managedSelectorLabels(agentSpec.Name)
	devboxAnnotations := cloneStringMap(Annotations(agentSpec))
	serviceAnnotations := cloneStringMap(devboxAnnotations)
	ingressAnnotations := cloneStringMap(devboxAnnotations)

	ingressAnnotations["nginx.ingress.kubernetes.io/proxy-body-size"] = "32m"
	ingressAnnotations["nginx.ingress.kubernetes.io/ssl-redirect"] = "false"
	ingressAnnotations["nginx.ingress.kubernetes.io/backend-protocol"] = "HTTP"
	ingressAnnotations["nginx.ingress.kubernetes.io/client-body-buffer-size"] = "64k"
	ingressAnnotations["nginx.ingress.kubernetes.io/proxy-buffer-size"] = "64k"
	ingressAnnotations["nginx.ingress.kubernetes.io/proxy-send-timeout"] = "300"
	ingressAnnotations["nginx.ingress.kubernetes.io/proxy-read-timeout"] = "300"
	ingressAnnotations["nginx.ingress.kubernetes.io/server-snippet"] = "client_header_buffer_size 64k;\nlarge_client_header_buffers 4 128k;"

	ingressLabels := cloneStringMap(labels)
	ingressLabels["cloud.sealos.io/app-deploy-manager"] = agentSpec.Name
	ingressLabels["cloud.sealos.io/app-deploy-manager-domain"] = options.IngressDomain

	return manifestTemplateData{
		Agent:              agentSpec,
		Image:              options.Image,
		IngressDomain:      options.IngressDomain,
		DevboxLabels:       cloneStringMap(labels),
		ServiceLabels:      cloneStringMap(labels),
		IngressLabels:      ingressLabels,
		SelectorLabels:     cloneStringMap(selectorLabels),
		DevboxAnnotations:  devboxAnnotations,
		ServiceAnnotations: serviceAnnotations,
		IngressAnnotations: ingressAnnotations,
	}
}

func resolveManifestTemplateDir(override string) (string, error) {
	candidates := []string{}

	if trimmed := strings.TrimSpace(override); trimmed != "" {
		candidates = append(candidates, trimmed)
	}

	if cwd, err := os.Getwd(); err == nil {
		relatives := []string{
			manifestTemplateRoot,
			filepath.Join("..", manifestTemplateRoot),
			filepath.Join("..", "..", manifestTemplateRoot),
			filepath.Join("..", "..", "..", manifestTemplateRoot),
			filepath.Join("..", "..", "..", "..", manifestTemplateRoot),
		}
		for _, relative := range relatives {
			candidates = append(candidates, filepath.Join(cwd, relative))
		}
	}

	if _, file, _, ok := runtime.Caller(0); ok {
		candidates = append(candidates, filepath.Join(filepath.Dir(file), "..", "..", "..", manifestTemplateRoot))
	}

	seen := map[string]struct{}{}
	for _, candidate := range candidates {
		cleaned := filepath.Clean(candidate)
		if _, exists := seen[cleaned]; exists {
			continue
		}
		seen[cleaned] = struct{}{}

		if manifestTemplateFilesExist(cleaned) {
			return cleaned, nil
		}
	}

	attempted := make([]string, 0, len(seen))
	for key := range seen {
		attempted = append(attempted, key)
	}
	sort.Strings(attempted)

	return "", fmt.Errorf("manifest templates not found under %s", strings.Join(attempted, ", "))
}

func manifestTemplateFilesExist(dir string) bool {
	requiredFiles := []string{"devbox.yaml.tmpl", "service.yaml.tmpl", "ingress.yaml.tmpl"}

	for _, name := range requiredFiles {
		info, err := os.Stat(filepath.Join(dir, name))
		if err != nil || info.IsDir() {
			return false
		}
	}

	return true
}

func renderUnstructuredManifest(path string, data manifestTemplateData) (map[string]any, error) {
	rendered, err := renderManifest(path, data)
	if err != nil {
		return nil, err
	}

	var object map[string]any
	if err := yaml.Unmarshal(rendered, &object); err != nil {
		return nil, fmt.Errorf("unmarshal manifest %s: %w", filepath.Base(path), err)
	}

	return object, nil
}

func renderTypedManifest(path string, data manifestTemplateData, target any) error {
	rendered, err := renderManifest(path, data)
	if err != nil {
		return err
	}

	if err := yaml.Unmarshal(rendered, target); err != nil {
		return fmt.Errorf("unmarshal manifest %s: %w", filepath.Base(path), err)
	}

	return nil
}

func renderManifest(path string, data manifestTemplateData) ([]byte, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read manifest %s: %w", filepath.Base(path), err)
	}

	tpl, err := template.New(filepath.Base(path)).Funcs(template.FuncMap{
		"quote": strconv.Quote,
	}).Option("missingkey=error").Parse(string(raw))
	if err != nil {
		return nil, fmt.Errorf("parse manifest %s: %w", filepath.Base(path), err)
	}

	var buffer bytes.Buffer
	if err := tpl.Execute(&buffer, data); err != nil {
		return nil, fmt.Errorf("render manifest %s: %w", filepath.Base(path), err)
	}

	return buffer.Bytes(), nil
}

func cloneStringMap(input map[string]string) map[string]string {
	cloned := make(map[string]string, len(input))
	for key, value := range input {
		cloned[key] = value
	}
	return cloned
}

func managedSelectorLabels(agentName string) map[string]string {
	return map[string]string{
		"agent.sealos.io/name":       agentName,
		"agent.sealos.io/managed-by": managedByValue,
	}
}
