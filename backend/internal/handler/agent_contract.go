package handler

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/nightwhite/Agent-Hub/internal/agent"
	"github.com/nightwhite/Agent-Hub/internal/agenttemplate"
	"github.com/nightwhite/Agent-Hub/internal/config"
	"github.com/nightwhite/Agent-Hub/internal/dto"
	"github.com/nightwhite/Agent-Hub/internal/kube"
)

const sshAccessTokenTTL = 1 * time.Hour

var templateDefinitionCache sync.Map

func resolveTemplateDefinition(cfg config.Config, templateID string) (agenttemplate.Definition, error) {
	templateID = strings.TrimSpace(templateID)
	if templateID == "" {
		return agenttemplate.Definition{}, fmt.Errorf("template id is required")
	}

	cacheKey := strings.TrimSpace(cfg.AgentTemplateDir) + "::" + templateID
	if cached, ok := templateDefinitionCache.Load(cacheKey); ok {
		if definition, typed := cached.(agenttemplate.Definition); typed {
			return definition, nil
		}
	}

	definition, err := agenttemplate.Resolve(templateID, cfg.AgentTemplateDir)
	if err != nil {
		return agenttemplate.Definition{}, err
	}
	templateDefinitionCache.Store(cacheKey, definition)
	return definition, nil
}

func buildAgentContract(view kube.AgentView, templateDef agenttemplate.Definition, cfg config.Config) dto.AgentContract {
	region := strings.TrimSpace(cfg.Region)
	accessItems := buildAgentAccessItems(view.Agent, templateDef, cfg)
	actionItems := buildAgentActions(view.Agent, templateDef, accessItems)

	return dto.AgentContract{
		Core: dto.AgentCoreContract{
			Name:             view.Agent.Name,
			AliasName:        view.Agent.AliasName,
			TemplateID:       view.Agent.TemplateID,
			Namespace:        view.Agent.Namespace,
			Status:           string(view.Agent.Status),
			StatusText:       string(view.Agent.Status),
			Ready:            view.Agent.Ready,
			BootstrapPhase:   view.Agent.BootstrapPhase,
			BootstrapMessage: view.Agent.BootstrapMessage,
			CreatedAt:        view.CreatedAt,
		},
		Workspaces: buildAgentWorkspaces(view.Agent, templateDef, accessItems, actionItems),
		Access:     accessItems,
		Runtime: dto.AgentRuntimeContract{
			CPU:              view.Agent.CPU,
			Memory:           view.Agent.Memory,
			Storage:          view.Agent.Storage,
			RuntimeClassName: view.Agent.RuntimeClassName,
			WorkingDir:       view.Agent.WorkingDir,
			User:             view.Agent.User,
			NetworkType:      view.Agent.NetworkType,
			SSHPort:          view.Agent.SSHPort,
			ModelProvider:    view.Agent.ModelProvider,
			ModelBaseURL:     view.Agent.ModelBaseURL,
			Model:            view.Agent.Model,
			HasModelAPIKey:   strings.TrimSpace(view.Agent.ModelAPIKey) != "",
		},
		Settings: dto.AgentSettingsContract{
			Runtime: toSettingFields(templateDef.Settings.Runtime, templateDef, region, buildSettingValues(view.Agent, templateDef.Settings.Runtime)),
			Agent:   toSettingFields(templateDef.Settings.Agent, templateDef, region, buildSettingValues(view.Agent, templateDef.Settings.Agent)),
		},
		Actions: actionItems,
	}
}

func buildAgentAccessItems(spec agent.Agent, templateDef agenttemplate.Definition, cfg config.Config) []dto.AgentAccessItem {
	result := make([]dto.AgentAccessItem, 0, len(templateDef.Access))
	for _, item := range templateDef.Access {
		result = append(result, resolveAgentAccessItem(spec, templateDef, item, cfg))
	}
	return result
}

func resolveAgentAccessItem(
	spec agent.Agent,
	templateDef agenttemplate.Definition,
	item agenttemplate.AccessDefinition,
	cfg config.Config,
) dto.AgentAccessItem {
	entry := dto.AgentAccessItem{
		Key:        item.Key,
		Label:      item.Label,
		Status:     "disabled",
		Enabled:    false,
		Reason:     "当前入口不可用",
		WorkingDir: spec.WorkingDir,
		Modes:      append([]string(nil), item.Modes...),
	}

	switch item.Key {
	case "api":
		entry.Auth = item.Auth
		entry.URL = joinAccessURL(spec.IngressDomain, item.Path)
		if entry.URL == "" {
			entry.Reason = "当前实例还没有可用的 API 接入地址。"
			return entry
		}
		entry.Enabled = spec.Ready
		entry.Status = accessStatus(spec.Ready)
		if spec.Ready {
			entry.Reason = ""
		} else {
			entry.Reason = bootstrapReason(spec)
		}
		return entry
	case "terminal":
		entry.Enabled = spec.Ready
		entry.Status = accessStatus(spec.Ready)
		if spec.Ready {
			entry.Reason = ""
		} else {
			entry.Reason = bootstrapReason(spec)
		}
		return entry
	case "files":
		entry.RootPath = firstNonEmpty(item.RootPath, spec.WorkingDir)
		entry.Enabled = spec.Ready
		entry.Status = accessStatus(spec.Ready)
		if spec.Ready {
			entry.Reason = ""
		} else {
			entry.Reason = bootstrapReason(spec)
		}
		return entry
	case "ssh":
		entry.Host = strings.TrimSpace(cfg.SSHDomain)
		entry.Port = spec.SSHPort
		entry.UserName = firstNonEmpty(spec.User, templateDef.User)
		if entry.Host == "" {
			entry.Reason = "系统未配置 SSH_DOMAIN。"
			return entry
		}
		if entry.Port <= 0 {
			entry.Reason = "当前实例没有可用的 SSH 端口。"
			return entry
		}
		entry.Enabled = spec.Ready
		entry.Status = accessStatus(spec.Ready)
		if spec.Ready {
			entry.Reason = ""
		} else {
			entry.Reason = bootstrapReason(spec)
		}
		return entry
	case "ide":
		ssh := resolveAgentAccessItem(spec, templateDef, agenttemplate.AccessDefinition{Key: "ssh", Label: "SSH"}, cfg)
		entry.Host = ssh.Host
		entry.Port = ssh.Port
		entry.UserName = ssh.UserName
		entry.Enabled = ssh.Enabled
		entry.Status = ssh.Status
		entry.Reason = ssh.Reason
		return entry
	case "web-ui":
		entry.URL = joinAccessURL(spec.IngressDomain, item.Path)
		if entry.URL == "" {
			entry.Reason = "当前实例还没有可用的 Web UI 地址。"
			return entry
		}
		entry.Enabled = spec.Ready
		entry.Status = accessStatus(spec.Ready)
		if spec.Ready {
			entry.Reason = ""
		} else {
			entry.Reason = bootstrapReason(spec)
		}
		return entry
	default:
		entry.Reason = "当前入口类型未识别。"
		return entry
	}
}

func buildAgentActions(spec agent.Agent, templateDef agenttemplate.Definition, accessItems []dto.AgentAccessItem) []dto.AgentActionItem {
	accessIndex := make(map[string]dto.AgentAccessItem, len(accessItems))
	for _, item := range accessItems {
		accessIndex[item.Key] = item
	}

	result := make([]dto.AgentActionItem, 0, len(templateDef.Actions))
	for _, item := range templateDef.Actions {
		action := dto.AgentActionItem{
			Key:   item.Key,
			Label: item.Label,
		}
		switch item.Key {
		case "open-chat":
			api := accessIndex["api"]
			action.Enabled = api.Enabled
			action.Reason = api.Reason
		case "open-terminal":
			terminal := accessIndex["terminal"]
			action.Enabled = terminal.Enabled
			action.Reason = terminal.Reason
		case "open-files":
			files := accessIndex["files"]
			action.Enabled = files.Enabled
			action.Reason = files.Reason
		case "open-settings":
			action.Enabled = true
		case "run":
			action.Enabled = spec.Status == agent.StatusPaused
			if !action.Enabled {
				action.Reason = "当前实例不处于可启动状态。"
			}
		case "pause":
			action.Enabled = spec.Status == agent.StatusRunning
			if !action.Enabled {
				action.Reason = "当前实例不处于可暂停状态。"
			}
		case "delete":
			action.Enabled = true
		default:
			action.Enabled = false
			action.Reason = "当前操作未接入。"
		}
		if action.Enabled {
			action.Reason = ""
		}
		result = append(result, action)
	}
	return result
}

func buildAgentWorkspaces(
	spec agent.Agent,
	templateDef agenttemplate.Definition,
	accessItems []dto.AgentAccessItem,
	actionItems []dto.AgentActionItem,
) []dto.AgentWorkspaceItem {
	accessIndex := make(map[string]dto.AgentAccessItem, len(accessItems))
	for _, item := range accessItems {
		accessIndex[item.Key] = item
	}
	actionIndex := make(map[string]dto.AgentActionItem, len(actionItems))
	for _, item := range actionItems {
		actionIndex[item.Key] = item
	}

	result := make([]dto.AgentWorkspaceItem, 0, len(templateDef.Workspaces))
	for _, workspace := range templateDef.Workspaces {
		entry := dto.AgentWorkspaceItem{
			Key:     workspace.Key,
			Label:   workspace.Label,
			Enabled: true,
		}

		switch workspace.Key {
		case "overview":
			entry.Enabled = true
		case "chat":
			action := actionIndex["open-chat"]
			entry.Enabled = action.Enabled
			entry.Reason = action.Reason
		case "terminal":
			access := accessIndex["terminal"]
			entry.Enabled = access.Enabled
			entry.Reason = access.Reason
		case "files":
			access := accessIndex["files"]
			entry.Enabled = access.Enabled
			entry.Reason = access.Reason
		case "settings":
			action := actionIndex["open-settings"]
			entry.Enabled = action.Enabled
			entry.Reason = action.Reason
		case "web-ui":
			access := accessIndex["web-ui"]
			entry.Enabled = access.Enabled
			entry.Reason = access.Reason
			entry.URL = access.URL
		default:
			entry.Enabled = false
			entry.Reason = "当前工作区未接入。"
		}

		if entry.Enabled {
			entry.Reason = ""
		}
		result = append(result, entry)
	}

	return result
}

func buildSettingValues(spec agent.Agent, fields []agenttemplate.SettingField) map[string]any {
	values := make(map[string]any, len(fields))
	for _, field := range fields {
		values[field.Key] = resolveSettingValue(spec, field)
	}
	return values
}

func resolveSettingValue(spec agent.Agent, field agenttemplate.SettingField) any {
	switch strings.TrimSpace(field.Binding.Kind) {
	case "runtime":
		switch strings.TrimSpace(field.Binding.Key) {
		case "cpu":
			return spec.CPU
		case "memory":
			return spec.Memory
		case "storage":
			return spec.Storage
		case "runtimeClassName":
			return spec.RuntimeClassName
		case "workingDir":
			return spec.WorkingDir
		case "user":
			return spec.User
		}
	case "agent", "derived":
		switch strings.TrimSpace(field.Binding.Key) {
		case "modelProvider":
			return spec.ModelProvider
		case "model":
			return spec.Model
		case "modelBaseURL":
			return spec.ModelBaseURL
		case "keySource":
			return keySource(spec)
		}
	case "annotation":
		return strings.TrimSpace(spec.Annotations[field.Binding.Name])
	case "env":
		return strings.TrimSpace(spec.Env[field.Binding.Name])
	}
	return nil
}

func keySource(spec agent.Agent) string {
	if strings.TrimSpace(spec.ModelAPIKey) == "" {
		return "unset"
	}
	if isAIProxyHermesProvider(spec.ModelProvider) {
		return "workspace-aiproxy"
	}
	return "custom"
}

func accessStatus(ready bool) string {
	if ready {
		return "ready"
	}
	return "pending"
}

func bootstrapReason(spec agent.Agent) string {
	if strings.TrimSpace(spec.BootstrapMessage) != "" {
		return spec.BootstrapMessage
	}
	return "当前实例尚未完成初始化。"
}

func joinAccessURL(host, path string) string {
	host = strings.TrimSpace(host)
	if host == "" {
		return ""
	}
	normalizedPath := strings.TrimSpace(path)
	if normalizedPath == "" {
		normalizedPath = "/"
	}
	if !strings.HasPrefix(normalizedPath, "/") {
		normalizedPath = "/" + normalizedPath
	}
	return "https://" + host + normalizedPath
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}

func templateSupportsAccess(definition agenttemplate.Definition, key string) bool {
	_, ok := findTemplateAccess(definition, key)
	return ok
}

func accessPath(definition agenttemplate.Definition, key string) string {
	item, ok := findTemplateAccess(definition, key)
	if !ok {
		return ""
	}
	return item.Path
}

func findTemplateAccess(definition agenttemplate.Definition, key string) (agenttemplate.AccessDefinition, bool) {
	for _, item := range definition.Access {
		if strings.EqualFold(strings.TrimSpace(item.Key), strings.TrimSpace(key)) {
			return item, true
		}
	}
	return agenttemplate.AccessDefinition{}, false
}

func generateSSHAccessToken(namespace, agentName string, secret []byte, now time.Time) (string, error) {
	headerJSON, err := json.Marshal(map[string]string{
		"alg": "HS256",
		"typ": "JWT",
	})
	if err != nil {
		return "", err
	}
	payloadJSON, err := json.Marshal(map[string]any{
		"namespace":  namespace,
		"devboxName": agentName,
		"iat":        now.Unix(),
		"exp":        now.Add(sshAccessTokenTTL).Unix(),
	})
	if err != nil {
		return "", err
	}

	unsigned := base64.RawURLEncoding.EncodeToString(headerJSON) + "." + base64.RawURLEncoding.EncodeToString(payloadJSON)
	signature, err := signHMACSHA256(unsigned, secret)
	if err != nil {
		return "", err
	}
	return unsigned + "." + base64.RawURLEncoding.EncodeToString(signature), nil
}
