package agenttemplate

import (
	"archive/tar"
	"compress/gzip"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"sync"
	"time"
)

const (
	templateRootDir       = "template"
	defaultGitHubRef      = "HEAD"
	defaultGitHubCacheTTL = 5 * time.Minute
)

type Source struct {
	Dir          string
	GitHubURL    string
	GitHubToken  string
	CacheDir     string
	HTTPClient   *http.Client
	ForceRefresh bool
}

var githubCacheMu sync.Mutex

func (s Source) cacheDir() string {
	if trimmed := strings.TrimSpace(s.CacheDir); trimmed != "" {
		return trimmed
	}
	return filepath.Join(os.TempDir(), "agenthub-template-cache")
}

func (s Source) client() *http.Client {
	if s.HTTPClient != nil {
		return s.HTTPClient
	}
	return &http.Client{Timeout: 30 * time.Second}
}

func (s Source) cacheKey() string {
	raw := strings.TrimSpace(s.GitHubURL)
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:])[:24]
}

func (s Source) cacheTTL() time.Duration {
	return defaultGitHubCacheTTL
}

func (s Source) ResolvedBaseDir() (string, error) {
	if strings.TrimSpace(s.GitHubURL) != "" {
		rootDir, err := s.resolveGitHubCacheDir()
		if err != nil {
			return "", err
		}
		if hasTemplateMetadata(rootDir) {
			return rootDir, nil
		}
		return resolveTemplateBaseDir(rootDir, false)
	}
	return resolveLocalTemplateBaseDir(s.Dir)
}

func (s Source) ResolvedRootDir(templateID string) (string, error) {
	if strings.TrimSpace(s.GitHubURL) != "" {
		rootDir, err := s.resolveGitHubCacheDir()
		if err != nil {
			return "", err
		}
		return resolveTemplateRootDir(templateID, rootDir, false)
	}
	return resolveLocalTemplateRootDir(templateID, s.Dir)
}

func (s Source) resolveGitHubCacheDir() (string, error) {
	repo, err := parseGitHubTemplateURL(s.GitHubURL)
	if err != nil {
		return "", err
	}

	githubCacheMu.Lock()
	defer githubCacheMu.Unlock()

	rootDir := filepath.Join(s.cacheDir(), s.cacheKey())
	readyPath := filepath.Join(rootDir, ".ready")
	if !s.ForceRefresh {
		if info, statErr := os.Stat(readyPath); statErr == nil && !info.IsDir() {
			cacheFresh := time.Since(info.ModTime()) < s.cacheTTL()
			if cacheFresh {
				if hasTemplateMetadata(rootDir) {
					return rootDir, nil
				}
				if _, baseErr := resolveTemplateBaseDir(rootDir, false); baseErr == nil {
					return rootDir, nil
				}
			}
		}
	}

	tmpDir := rootDir + ".tmp"
	if err := os.RemoveAll(tmpDir); err != nil {
		return "", fmt.Errorf("clear github template cache: %w", err)
	}
	if err := os.MkdirAll(tmpDir, 0o755); err != nil {
		return "", fmt.Errorf("create github template cache: %w", err)
	}
	if err := s.downloadGitHubArchive(repo, tmpDir); err != nil {
		_ = os.RemoveAll(tmpDir)
		return "", err
	}

	if err := os.WriteFile(filepath.Join(tmpDir, ".ready"), []byte(time.Now().UTC().Format(time.RFC3339Nano)+"\n"), 0o644); err != nil {
		_ = os.RemoveAll(tmpDir)
		return "", fmt.Errorf("mark github template cache ready: %w", err)
	}
	if err := os.RemoveAll(rootDir); err != nil {
		_ = os.RemoveAll(tmpDir)
		return "", fmt.Errorf("replace github template cache: %w", err)
	}
	if err := os.Rename(tmpDir, rootDir); err != nil {
		_ = os.RemoveAll(tmpDir)
		return "", fmt.Errorf("replace github template cache: %w", err)
	}

	return rootDir, nil
}

func (s Source) downloadGitHubArchive(repo githubTemplateRepo, targetDir string) error {
	req, err := http.NewRequest(http.MethodGet, repo.archiveURL(), nil)
	if err != nil {
		return fmt.Errorf("create github archive request: %w", err)
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("User-Agent", "agent-hub-template-loader")
	if token := strings.TrimSpace(s.GitHubToken); token != "" && repo.shouldAttachGitHubToken() {
		req.Header.Set("Authorization", "Bearer "+token)
	}

	resp, err := s.client().Do(req)
	if err != nil {
		return fmt.Errorf("download github template archive: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("download github template archive: github returned %s", resp.Status)
	}

	gzipReader, err := gzip.NewReader(resp.Body)
	if err != nil {
		return fmt.Errorf("read github template archive: %w", err)
	}
	defer gzipReader.Close()

	return extractTemplateArchive(gzipReader, targetDir, repo.Path)
}

type githubTemplateRepo struct {
	Owner  string
	Repo   string
	Ref    string
	Path   string
	RawURL string
}

func (r githubTemplateRepo) archiveURL() string {
	if r.RawURL != "" {
		return r.RawURL
	}
	return fmt.Sprintf("https://api.github.com/repos/%s/%s/tarball/%s", r.Owner, r.Repo, url.PathEscape(r.Ref))
}

func (r githubTemplateRepo) shouldAttachGitHubToken() bool {
	return r.RawURL == "" && strings.TrimSpace(r.Owner) != "" && strings.TrimSpace(r.Repo) != ""
}

func parseGitHubTemplateURL(raw string) (githubTemplateRepo, error) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return githubTemplateRepo{}, fmt.Errorf("github template url is required")
	}

	parsed, err := url.Parse(trimmed)
	if err != nil {
		return githubTemplateRepo{}, fmt.Errorf("parse github template url: %w", err)
	}
	if parsed.Scheme == "" {
		parsed, err = url.Parse("https://" + trimmed)
		if err != nil {
			return githubTemplateRepo{}, fmt.Errorf("parse github template url: %w", err)
		}
	}

	if strings.HasSuffix(parsed.Path, ".tar.gz") {
		return githubTemplateRepo{Ref: defaultGitHubRef, RawURL: parsed.String()}, nil
	}
	if !strings.EqualFold(parsed.Host, "github.com") {
		return githubTemplateRepo{}, fmt.Errorf("github template url must use github.com")
	}

	parts := splitPath(parsed.EscapedPath())
	if len(parts) < 2 {
		return githubTemplateRepo{}, fmt.Errorf("github template url must include owner and repo")
	}

	repo := githubTemplateRepo{
		Owner: parts[0],
		Repo:  parts[1],
		Ref:   defaultGitHubRef,
	}
	if len(parts) >= 4 && parts[2] == "tree" {
		ref, subPath := splitGitHubTreeRef(parts[3:])
		repo.Ref = ref
		repo.Path = subPath
	}
	if queryRef := strings.TrimSpace(parsed.Query().Get("ref")); queryRef != "" {
		repo.Ref = queryRef
	}
	if queryPath := strings.Trim(strings.TrimSpace(parsed.Query().Get("path")), "/"); queryPath != "" {
		repo.Path = queryPath
	}
	return repo, nil
}

func splitPath(value string) []string {
	rawParts := strings.Split(strings.Trim(value, "/"), "/")
	parts := make([]string, 0, len(rawParts))
	for _, part := range rawParts {
		unescaped, err := url.PathUnescape(part)
		if err != nil {
			unescaped = part
		}
		if strings.TrimSpace(unescaped) != "" {
			parts = append(parts, unescaped)
		}
	}
	return parts
}

func splitGitHubTreeRef(parts []string) (string, string) {
	if len(parts) == 0 {
		return defaultGitHubRef, ""
	}

	for splitAt := len(parts); splitAt >= 1; splitAt-- {
		ref := strings.Join(parts[:splitAt], "/")
		subPath := strings.Join(parts[splitAt:], "/")
		if ref == defaultGitHubRef || strings.HasPrefix(ref, "refs/") || strings.HasPrefix(ref, "release/") {
			return ref, subPath
		}
	}
	return parts[0], strings.Join(parts[1:], "/")
}

func extractTemplateArchive(reader io.Reader, targetDir, sourcePath string) error {
	tarReader := tar.NewReader(reader)
	sourcePath = strings.Trim(strings.TrimSpace(sourcePath), "/")
	extracted := false

	for {
		header, err := tarReader.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return fmt.Errorf("read github template archive: %w", err)
		}

		relative, ok := archiveRelativePath(header.Name, sourcePath)
		if !ok || relative == "" {
			continue
		}

		targetPath := filepath.Join(targetDir, filepath.FromSlash(relative))
		if !strings.HasPrefix(targetPath, filepath.Clean(targetDir)+string(os.PathSeparator)) {
			return fmt.Errorf("github template archive contains unsafe path %q", header.Name)
		}

		switch header.Typeflag {
		case tar.TypeDir:
			if err := os.MkdirAll(targetPath, 0o755); err != nil {
				return fmt.Errorf("create template archive directory: %w", err)
			}
		case tar.TypeReg, tar.TypeRegA:
			if err := os.MkdirAll(filepath.Dir(targetPath), 0o755); err != nil {
				return fmt.Errorf("create template archive directory: %w", err)
			}
			if err := writeArchiveFile(targetPath, tarReader, header.FileInfo().Mode()); err != nil {
				return err
			}
			extracted = true
		}
	}

	if !extracted {
		return fmt.Errorf("github template archive did not contain template files")
	}
	return nil
}

func archiveRelativePath(name, sourcePath string) (string, bool) {
	cleaned := path.Clean(strings.TrimPrefix(name, "/"))
	if cleaned == "." || strings.HasPrefix(cleaned, "../") {
		return "", false
	}

	parts := strings.Split(cleaned, "/")
	if len(parts) <= 1 {
		return "", false
	}
	withoutRoot := strings.Join(parts[1:], "/")
	if sourcePath == "" {
		return withoutRoot, true
	}
	if withoutRoot == sourcePath {
		return "", true
	}
	if strings.HasPrefix(withoutRoot, sourcePath+"/") {
		return strings.TrimPrefix(withoutRoot, sourcePath+"/"), true
	}
	return "", false
}

func writeArchiveFile(targetPath string, reader io.Reader, mode os.FileMode) error {
	file, err := os.OpenFile(targetPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, mode.Perm())
	if err != nil {
		return fmt.Errorf("create template archive file: %w", err)
	}
	defer file.Close()
	if _, err := io.Copy(file, reader); err != nil {
		return fmt.Errorf("write template archive file: %w", err)
	}
	return nil
}

func hasTemplateMetadata(dir string) bool {
	info, err := os.Stat(filepath.Join(dir, "template.yaml"))
	return err == nil && !info.IsDir()
}

func resolveLocalTemplateRootDir(templateID, override string) (string, error) {
	return resolveTemplateRootDir(templateID, override, true)
}

func resolveTemplateRootDir(templateID, override string, includeDefaults bool) (string, error) {
	candidates := []string{}

	if trimmed := strings.TrimSpace(override); trimmed != "" {
		candidates = append(candidates, filepath.Join(trimmed, templateID))
		for _, collectionDir := range templateCollectionDirs() {
			candidates = append(candidates, filepath.Join(trimmed, collectionDir, templateID))
		}
		candidates = append(candidates, trimmed)
	}

	if includeDefaults {
		if cwd, err := os.Getwd(); err == nil {
			for _, relative := range defaultTemplateRootCandidates(templateID) {
				candidates = append(candidates, filepath.Join(cwd, relative))
			}
		}
	}

	if includeDefaults {
		if _, file, _, ok := runtime.Caller(0); ok {
			candidates = append(candidates, filepath.Join(filepath.Dir(file), "testdata", templateRootDir, templateID))
		}
	}

	seen := map[string]struct{}{}
	attempted := []string{}
	for _, candidate := range candidates {
		root := normalizeTemplateRootCandidate(candidate)
		if root == "" {
			continue
		}
		if _, exists := seen[root]; exists {
			continue
		}
		seen[root] = struct{}{}
		attempted = append(attempted, root)

		info, err := os.Stat(filepath.Join(root, "template.yaml"))
		if err == nil && !info.IsDir() {
			return root, nil
		}
	}

	sort.Strings(attempted)
	return "", fmt.Errorf("template %q not found under %s", templateID, strings.Join(attempted, ", "))
}

func resolveLocalTemplateBaseDir(override string) (string, error) {
	return resolveTemplateBaseDir(override, true)
}

func resolveTemplateBaseDir(override string, includeDefaults bool) (string, error) {
	candidates := []string{}
	if trimmed := strings.TrimSpace(override); trimmed != "" {
		candidates = append(candidates, trimmed)
	}

	if includeDefaults {
		if cwd, err := os.Getwd(); err == nil {
			for _, relative := range defaultTemplateBaseCandidates() {
				candidates = append(candidates, filepath.Join(cwd, relative))
			}
		}
	}

	if includeDefaults {
		if _, file, _, ok := runtime.Caller(0); ok {
			candidates = append(candidates, filepath.Join(filepath.Dir(file), "testdata", templateRootDir))
		}
	}

	seen := map[string]struct{}{}
	attempted := []string{}
	for _, candidate := range candidates {
		baseDir := normalizeTemplateBaseCandidate(candidate)
		if baseDir == "" {
			continue
		}
		if _, exists := seen[baseDir]; exists {
			continue
		}
		seen[baseDir] = struct{}{}
		attempted = append(attempted, baseDir)

		info, err := os.Stat(baseDir)
		if err == nil && info.IsDir() {
			return baseDir, nil
		}
	}

	sort.Strings(attempted)
	return "", fmt.Errorf("template base directory not found under %s", strings.Join(attempted, ", "))
}

func defaultTemplateRootCandidates(templateID string) []string {
	return []string{
		filepath.Join(templateRootDir, templateID),
		filepath.Join("..", templateRootDir, templateID),
		filepath.Join("..", "..", templateRootDir, templateID),
		filepath.Join("..", "..", "..", templateRootDir, templateID),
		filepath.Join("..", "..", "..", "..", templateRootDir, templateID),
		filepath.Join("internal", "agenttemplate", "testdata", templateRootDir, templateID),
		filepath.Join("..", "internal", "agenttemplate", "testdata", templateRootDir, templateID),
	}
}

func defaultTemplateBaseCandidates() []string {
	return []string{
		templateRootDir,
		filepath.Join("..", templateRootDir),
		filepath.Join("..", "..", templateRootDir),
		filepath.Join("..", "..", "..", templateRootDir),
		filepath.Join("..", "..", "..", "..", templateRootDir),
		filepath.Join("internal", "agenttemplate", "testdata", templateRootDir),
		filepath.Join("..", "internal", "agenttemplate", "testdata", templateRootDir),
	}
}
