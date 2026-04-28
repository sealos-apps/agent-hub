package handler

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	kubernetes "k8s.io/client-go/kubernetes"

	"github.com/nightwhite/Agent-Hub/internal/agent"
	"github.com/nightwhite/Agent-Hub/internal/dto"
	appErr "github.com/nightwhite/Agent-Hub/pkg/errors"
)

const (
	devboxPublicKeySecretKey  = "SEALOS_DEVBOX_PUBLIC_KEY"
	devboxPrivateKeySecretKey = "SEALOS_DEVBOX_PRIVATE_KEY"
	devboxJWTSecretKey        = "SEALOS_DEVBOX_JWT_SECRET"
)

func GetAgentSSHAccess(c *gin.Context) {
	cfg := runtimeConfig(c)
	if strings.TrimSpace(cfg.SSHDomain) == "" {
		writeAppError(c, http.StatusInternalServerError, appErr.New(appErr.CodeNotImplemented, "SSH_DOMAIN is required").WithDetails(map[string]any{
			"field":  "SSH_DOMAIN",
			"reason": "missing",
		}))
		return
	}

	factory, err := kubeFactory(c)
	if err != nil {
		writeHeaderKubeconfigError(c, err)
		return
	}
	agentName := c.Param("agentName")
	if err := validateAgentName(agentName); err != nil {
		writeValidationError(c, err)
		return
	}

	ctx := c.Request.Context()
	repo, clientset, ok := newClients(c, factory)
	if !ok {
		return
	}

	view, found := getAgentView(ctx, factory.Namespace(), agentName, repo, clientset, c)
	if !found {
		return
	}

	templateDef, resolveErr := resolveTemplateDefinition(cfg, view.Agent.TemplateID)
	if resolveErr != nil {
		writeAppError(c, http.StatusInternalServerError, appErr.New(appErr.CodeKubernetesOperation, resolveErr.Error()))
		return
	}
	if !templateSupportsAccess(templateDef, "ssh") {
		writeAppError(c, http.StatusBadRequest, appErr.New(appErr.CodeInvalidRequest, "agent template does not support ssh access"))
		return
	}
	if view.Agent.SSHPort <= 0 {
		writeAppError(c, http.StatusConflict, appErr.New(appErr.CodeKubernetesOperation, "agent ssh port is unavailable"))
		return
	}

	response, responseErr := buildSSHAccessResponse(ctx, clientset, factory.Namespace(), agentName, cfg.SSHDomain, view.Agent)
	if responseErr != nil {
		writeAppError(c, http.StatusInternalServerError, appErr.New(appErr.CodeKubernetesOperation, responseErr.Error()))
		return
	}
	writeSuccess(c, http.StatusOK, response)
}

func buildSSHAccessResponse(
	ctx context.Context,
	clientset kubernetes.Interface,
	namespace string,
	agentName string,
	sshDomain string,
	spec agent.Agent,
) (dto.AgentSSHAccessResponse, error) {
	secret, err := clientset.CoreV1().Secrets(namespace).Get(ctx, agentName, metav1.GetOptions{})
	if err != nil {
		return dto.AgentSSHAccessResponse{}, fmt.Errorf("read ssh secret: %w", err)
	}

	base64PublicKey := strings.TrimSpace(string(secret.Data[devboxPublicKeySecretKey]))
	base64PrivateKey := strings.TrimSpace(string(secret.Data[devboxPrivateKeySecretKey]))
	base64JWTSecret := strings.TrimSpace(string(secret.Data[devboxJWTSecretKey]))
	if base64PublicKey == "" || base64PrivateKey == "" || base64JWTSecret == "" {
		return dto.AgentSSHAccessResponse{}, fmt.Errorf("ssh secret is incomplete")
	}

	jwtSecret, err := base64.StdEncoding.DecodeString(base64JWTSecret)
	if err != nil {
		return dto.AgentSSHAccessResponse{}, fmt.Errorf("decode ssh jwt secret: %w", err)
	}
	token, err := generateSSHAccessToken(namespace, agentName, jwtSecret, time.Now())
	if err != nil {
		return dto.AgentSSHAccessResponse{}, fmt.Errorf("generate ssh token: %w", err)
	}

	return dto.AgentSSHAccessResponse{
		Host:             strings.TrimSpace(sshDomain),
		Port:             spec.SSHPort,
		UserName:         spec.User,
		WorkingDir:       spec.WorkingDir,
		Base64PublicKey:  base64PublicKey,
		Base64PrivateKey: base64PrivateKey,
		Token:            token,
		ConfigHost:       fmt.Sprintf("%s_%s_%s", strings.TrimSpace(sshDomain), namespace, agentName),
	}, nil
}

func signHMACSHA256(message string, secret []byte) ([]byte, error) {
	mac := hmac.New(sha256.New, secret)
	if _, err := mac.Write([]byte(message)); err != nil {
		return nil, err
	}
	return mac.Sum(nil), nil
}
