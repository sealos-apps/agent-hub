package aiproxy

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

type Client struct {
	baseURL    *url.URL
	httpClient *http.Client
}

type Token struct {
	ID     int
	Name   string
	Key    string
	Status int
}

type APIError struct {
	Status  int
	Message string
	Payload any
}

var tokenSearchPaths = []string{
	"/api/v2alpha/tokens",
	"/api/v2alpha/token/search",
}

var tokenCreatePaths = []string{
	"/api/v2alpha/tokens",
	"/api/v2alpha/token",
}

func (e *APIError) Error() string {
	return strings.TrimSpace(e.Message)
}

func NewClient(baseURL string, httpClient *http.Client) (*Client, error) {
	parsed, err := url.Parse(strings.TrimSpace(baseURL))
	if err != nil {
		return nil, fmt.Errorf("parse aiproxy base url: %w", err)
	}
	if parsed.Scheme == "" || parsed.Host == "" {
		return nil, fmt.Errorf("invalid aiproxy base url")
	}

	if httpClient == nil {
		httpClient = &http.Client{Timeout: 15 * time.Second}
	}

	return &Client{
		baseURL:    parsed,
		httpClient: httpClient,
	}, nil
}

func (c *Client) EnsureToken(ctx context.Context, authorization, name string) (Token, bool, error) {
	token, found, err := c.SearchTokenByName(ctx, authorization, name)
	if err != nil {
		return Token{}, false, err
	}
	if found {
		return token, true, nil
	}

	created, err := c.CreateToken(ctx, authorization, name)
	if err == nil {
		return created, false, nil
	}

	if !isConflictLike(err) {
		return Token{}, false, err
	}

	token, found, searchErr := c.SearchTokenByName(ctx, authorization, name)
	if searchErr != nil {
		return Token{}, false, searchErr
	}
	if !found {
		return Token{}, false, err
	}
	return token, true, nil
}

func (c *Client) SearchTokenByName(ctx context.Context, authorization, name string) (Token, bool, error) {
	payload, err := c.doJSONWithFallback(ctx, http.MethodGet, tokenSearchPaths, authorization, url.Values{
		"name": []string{name},
	}, nil)
	if err != nil {
		return Token{}, false, err
	}

	token, found := extractToken(payload, name)
	return token, found, nil
}

func (c *Client) CreateToken(ctx context.Context, authorization, name string) (Token, error) {
	payload, err := c.doJSONWithFallback(ctx, http.MethodPost, tokenCreatePaths, authorization, nil, map[string]any{
		"name": name,
	})
	if err != nil {
		return Token{}, err
	}

	token, found := extractToken(payload, name)
	if found {
		return token, nil
	}

	// Some AIProxy deployments return 204 with an empty body on create.
	created, found, searchErr := c.SearchTokenByName(ctx, authorization, name)
	if searchErr != nil {
		return Token{}, searchErr
	}
	if found {
		return created, nil
	}

	return Token{}, &APIError{
		Status:  http.StatusBadGateway,
		Message: "aiproxy create response did not include token payload",
		Payload: payload,
	}
}

func (c *Client) doJSON(ctx context.Context, method, path, authorization string, query url.Values, body any) (any, error) {
	return c.doJSONToBaseURL(ctx, c.baseURL, method, path, authorization, query, body)
}

func (c *Client) doJSONWithFallback(ctx context.Context, method string, paths []string, authorization string, query url.Values, body any) (any, error) {
	if len(paths) == 0 {
		return nil, &APIError{
			Status:  http.StatusBadRequest,
			Message: "aiproxy request paths are empty",
		}
	}

	bases := c.candidateBaseURLs()
	var attempted []string
	var lastStatus int
	var lastMessage string

	for _, base := range bases {
		for _, path := range paths {
			requestURL := resolveRequestURL(base, path, query)
			payload, err := c.doJSONToBaseURL(ctx, base, method, path, authorization, query, body)
			if err == nil {
				return payload, nil
			}

			apiErr, ok := err.(*APIError)
			if !ok || !isRouteNotFound(apiErr) {
				return nil, err
			}

			attempted = append(attempted, requestURL)
			lastStatus = apiErr.Status
			lastMessage = apiErr.Message
		}
	}

	if len(attempted) == 0 {
		return nil, &APIError{
			Status:  http.StatusBadGateway,
			Message: "aiproxy request failed and no fallback endpoint was attempted",
		}
	}

	if lastStatus == 0 {
		lastStatus = http.StatusNotFound
	}
	if strings.TrimSpace(lastMessage) == "" {
		lastMessage = "endpoint not found"
	}

	return nil, &APIError{
		Status: lastStatus,
		Message: fmt.Sprintf(
			"aiproxy endpoint not found after trying %d candidate(s): %s (last error: %s)",
			len(attempted),
			strings.Join(attempted, ", "),
			lastMessage,
		),
		Payload: map[string]any{
			"attemptedURLs": attempted,
			"lastError":     lastMessage,
		},
	}
}

func (c *Client) doJSONToBaseURL(ctx context.Context, base *url.URL, method, path, authorization string, query url.Values, body any) (any, error) {
	requestURL := base.ResolveReference(&url.URL{Path: path})
	if len(query) > 0 {
		requestURL.RawQuery = query.Encode()
	}

	var requestBody io.Reader
	if body != nil {
		raw, err := json.Marshal(body)
		if err != nil {
			return nil, err
		}
		requestBody = bytes.NewReader(raw)
	}

	req, err := http.NewRequestWithContext(ctx, method, requestURL.String(), requestBody)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if strings.TrimSpace(authorization) != "" {
		req.Header.Set("Authorization", authorization)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	rawBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	payload := parseResponseBody(rawBody)
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, &APIError{
			Status:  resp.StatusCode,
			Message: messageFromPayload(payload, fmt.Sprintf("aiproxy request failed with status %d", resp.StatusCode)),
			Payload: payload,
		}
	}

	if message, failed := envelopeFailure(payload); failed {
		return nil, &APIError{
			Status:  resp.StatusCode,
			Message: message,
			Payload: payload,
		}
	}

	return payload, nil
}

func (c *Client) candidateBaseURLs() []*url.URL {
	primary := cloneURL(c.baseURL)
	if primary == nil {
		return nil
	}

	candidates := []*url.URL{primary}
	if alternate := alternateAIProxyBaseURL(primary); alternate != nil {
		candidates = append(candidates, alternate)
	}

	seen := make(map[string]struct{}, len(candidates))
	unique := make([]*url.URL, 0, len(candidates))
	for _, candidate := range candidates {
		if candidate == nil {
			continue
		}
		key := strings.TrimSpace(candidate.String())
		if key == "" {
			continue
		}
		if _, exists := seen[key]; exists {
			continue
		}
		seen[key] = struct{}{}
		unique = append(unique, candidate)
	}

	return unique
}

func cloneURL(source *url.URL) *url.URL {
	if source == nil {
		return nil
	}
	copied := *source
	return &copied
}

func alternateAIProxyBaseURL(base *url.URL) *url.URL {
	if base == nil {
		return nil
	}

	host := strings.TrimSpace(base.Hostname())
	if host == "" {
		return nil
	}

	var alternateHost string
	switch {
	case strings.HasPrefix(host, "aiproxy-web."):
		alternateHost = strings.TrimPrefix(host, "aiproxy-web.")
		alternateHost = "aiproxy." + alternateHost
	case strings.HasPrefix(host, "aiproxy."):
		alternateHost = strings.TrimPrefix(host, "aiproxy.")
		alternateHost = "aiproxy-web." + alternateHost
	default:
		return nil
	}

	if strings.EqualFold(host, alternateHost) {
		return nil
	}

	copied := cloneURL(base)
	if copied == nil {
		return nil
	}
	if port := strings.TrimSpace(base.Port()); port != "" {
		copied.Host = net.JoinHostPort(alternateHost, port)
	} else {
		copied.Host = alternateHost
	}

	return copied
}

func resolveRequestURL(base *url.URL, path string, query url.Values) string {
	if base == nil {
		return path
	}
	requestURL := base.ResolveReference(&url.URL{Path: path})
	if len(query) > 0 {
		requestURL.RawQuery = query.Encode()
	}
	return requestURL.String()
}

func isRouteNotFound(err *APIError) bool {
	if err == nil {
		return false
	}
	return err.Status == http.StatusNotFound
}

func parseResponseBody(raw []byte) any {
	trimmed := bytes.TrimSpace(raw)
	if len(trimmed) == 0 {
		return nil
	}

	var payload any
	if err := json.Unmarshal(trimmed, &payload); err == nil {
		return payload
	}

	return string(trimmed)
}

func envelopeFailure(payload any) (string, bool) {
	object, ok := payload.(map[string]any)
	if !ok {
		return "", false
	}

	code, ok := intFromAny(object["code"])
	if !ok || code == 0 {
		return "", false
	}

	return messageFromPayload(payload, fmt.Sprintf("aiproxy request failed with code %d", code)), true
}

func messageFromPayload(payload any, fallback string) string {
	switch value := payload.(type) {
	case map[string]any:
		if message := stringFromAny(value["message"]); message != "" {
			return message
		}
		if message := stringFromAny(value["msg"]); message != "" {
			return message
		}
		if nested, ok := value["error"].(map[string]any); ok {
			if message := stringFromAny(nested["message"]); message != "" {
				return message
			}
		}
	case string:
		trimmed := strings.TrimSpace(value)
		if trimmed != "" {
			lowered := strings.ToLower(trimmed)
			if strings.HasPrefix(lowered, "<!doctype html") || strings.HasPrefix(lowered, "<html") {
				return "upstream returned HTML response body"
			}
			if len(trimmed) > 512 {
				return trimmed[:512] + "..."
			}
			return trimmed
		}
	}

	return fallback
}

func extractToken(payload any, expectedName string) (Token, bool) {
	records := collectTokenRecords(payload)
	if len(records) == 0 {
		return Token{}, false
	}

	expected := strings.TrimSpace(strings.ToLower(expectedName))
	for _, record := range records {
		token := mapToToken(record)
		if token.Name == "" {
			token.Name = expectedName
		}
		if expected == "" || strings.EqualFold(token.Name, expectedName) {
			return token, true
		}
		if token.Name == "" && expected == "" {
			return token, true
		}
	}

	if expected == "" {
		return mapToToken(records[0]), true
	}

	for _, record := range records {
		token := mapToToken(record)
		if strings.TrimSpace(strings.ToLower(token.Name)) == expected {
			return token, true
		}
	}

	return Token{}, false
}

func collectTokenRecords(value any) []map[string]any {
	switch current := value.(type) {
	case map[string]any:
		if looksLikeTokenRecord(current) {
			return []map[string]any{current}
		}

		keys := []string{"data", "item", "token", "tokens", "items", "list", "records", "rows", "result"}
		var found []map[string]any
		for _, key := range keys {
			nested, ok := current[key]
			if !ok {
				continue
			}
			found = append(found, collectTokenRecords(nested)...)
		}
		if len(found) > 0 {
			return found
		}

		for _, nested := range current {
			found = append(found, collectTokenRecords(nested)...)
		}
		return found
	case []any:
		var found []map[string]any
		for _, item := range current {
			found = append(found, collectTokenRecords(item)...)
		}
		return found
	default:
		return nil
	}
}

func looksLikeTokenRecord(record map[string]any) bool {
	if _, ok := record["name"]; ok {
		return true
	}
	if _, ok := record["key"]; ok {
		return true
	}
	_, hasID := record["id"]
	_, hasGroup := record["group"]
	_, hasStatus := record["status"]
	return hasID && (hasGroup || hasStatus)
}

func mapToToken(record map[string]any) Token {
	return Token{
		ID:     intValue(record["id"]),
		Name:   firstString(record["name"], record["token_name"]),
		Key:    firstString(record["key"], record["token"], record["value"], record["access_token"]),
		Status: intValue(record["status"]),
	}
}

func firstString(values ...any) string {
	for _, value := range values {
		if text := stringFromAny(value); text != "" {
			return text
		}
	}
	return ""
}

func stringFromAny(value any) string {
	switch current := value.(type) {
	case string:
		return strings.TrimSpace(current)
	case fmt.Stringer:
		return strings.TrimSpace(current.String())
	default:
		return ""
	}
}

func intValue(value any) int {
	number, ok := intFromAny(value)
	if !ok {
		return 0
	}
	return number
}

func intFromAny(value any) (int, bool) {
	switch current := value.(type) {
	case int:
		return current, true
	case int32:
		return int(current), true
	case int64:
		return int(current), true
	case float32:
		return int(current), true
	case float64:
		return int(current), true
	case json.Number:
		next, err := current.Int64()
		if err != nil {
			return 0, false
		}
		return int(next), true
	case string:
		if strings.TrimSpace(current) == "" {
			return 0, false
		}
		next, err := strconv.Atoi(strings.TrimSpace(current))
		if err != nil {
			return 0, false
		}
		return next, true
	default:
		return 0, false
	}
}

func isConflictLike(err error) bool {
	apiErr, ok := err.(*APIError)
	if ok && apiErr.Status == http.StatusConflict {
		return true
	}
	message := strings.ToLower(strings.TrimSpace(err.Error()))
	return strings.Contains(message, "exist") || strings.Contains(message, "duplicate") || strings.Contains(message, "conflict")
}
