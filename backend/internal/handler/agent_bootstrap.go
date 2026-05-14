package handler

import (
	"context"
	"fmt"
	"log"
	"os"
	"strings"
	"time"

	"github.com/nightwhite/Agent-Hub/internal/agent"
	"github.com/nightwhite/Agent-Hub/internal/agenttemplate"
	"github.com/nightwhite/Agent-Hub/internal/config"
	"github.com/nightwhite/Agent-Hub/internal/kube"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/util/retry"
)

const bootstrapPollInterval = 3 * time.Second

func scheduleAgentBootstrap(factory *kube.Factory, cfg config.Config, templateDef agenttemplate.Definition, spec agent.Agent) {
	if factory == nil || strings.TrimSpace(spec.Name) == "" {
		return
	}

	agentSpec := spec
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), bootstrapLifecycleTimeout(templateDef))
		defer cancel()

		if err := runAgentBootstrapLifecycle(ctx, factory, cfg, templateDef, agentSpec); err != nil {
			log.Printf("agent bootstrap failed for %s/%s: %v", factory.Namespace(), agentSpec.Name, err)
		}
	}()
}

func bootstrapLifecycleTimeout(templateDef agenttemplate.Definition) time.Duration {
	total := templateDef.Bootstrap.TimeoutSeconds + templateDef.Healthcheck.TimeoutSeconds + 60
	if total < 120 {
		total = 120
	}
	return time.Duration(total) * time.Second
}

func runAgentBootstrapLifecycle(
	ctx context.Context,
	factory *kube.Factory,
	cfg config.Config,
	templateDef agenttemplate.Definition,
	spec agent.Agent,
) error {
	dynamicClient, err := factory.Dynamic()
	if err != nil {
		return fmt.Errorf("build dynamic client: %w", err)
	}
	clientset, err := factory.Kubernetes()
	if err != nil {
		return fmt.Errorf("build kubernetes clientset: %w", err)
	}

	repo := kube.NewRepository(dynamicClient, factory.Namespace())
	if err := persistBootstrapStatus(ctx, repo, spec.Name, kube.BootstrapPhaseRunning, "等待实例启动"); err != nil {
		return err
	}

	if _, err := waitForAgentPod(ctx, clientset, factory, spec.Name); err != nil {
		_ = persistBootstrapStatus(context.Background(), repo, spec.Name, kube.BootstrapPhaseFailed, "实例未在超时内进入可执行状态")
		return err
	}

	if err := persistBootstrapStatus(ctx, repo, spec.Name, kube.BootstrapPhaseRunning, "执行模板初始化脚本"); err != nil {
		return err
	}

	if err := executeTemplateScript(ctx, clientset, factory, spec.Name, templateDef.Bootstrap.Script, templateDef.BootstrapScriptPath(), templateDef.Bootstrap.TimeoutSeconds); err != nil {
		message := truncateBootstrapMessage(err.Error())
		_ = persistBootstrapStatus(context.Background(), repo, spec.Name, kube.BootstrapPhaseFailed, message)
		return err
	}

	if templateDef.ModelSwitch.Enabled && strings.TrimSpace(spec.Model) != "" {
		if err := persistBootstrapStatus(ctx, repo, spec.Name, kube.BootstrapPhaseRunning, "初始化模型配置"); err != nil {
			return err
		}
		if _, err := runAgentHubModelInit(ctx, clientset, factory, cfg, templateDef, spec); err != nil {
			message := truncateBootstrapMessage(err.Error())
			_ = persistBootstrapStatus(context.Background(), repo, spec.Name, kube.BootstrapPhaseFailed, message)
			return err
		}
	}

	if err := persistBootstrapStatus(ctx, repo, spec.Name, kube.BootstrapPhaseRunning, "等待健康检查通过"); err != nil {
		return err
	}

	if err := waitForTemplateHealthcheck(ctx, clientset, factory, spec.Name, templateDef); err != nil {
		message := truncateBootstrapMessage(err.Error())
		_ = persistBootstrapStatus(context.Background(), repo, spec.Name, kube.BootstrapPhaseFailed, message)
		return err
	}

	if err := persistBootstrapStatus(ctx, repo, spec.Name, kube.BootstrapPhaseReady, "实例已完成初始化"); err != nil {
		return err
	}

	return nil
}

func waitForAgentPod(ctx context.Context, clientset kubernetes.Interface, factory *kube.Factory, agentName string) (kube.PodRef, error) {
	ticker := time.NewTicker(bootstrapPollInterval)
	defer ticker.Stop()

	var lastErr error
	for {
		pod, err := kube.ResolveAgentPod(ctx, clientset, factory.Namespace(), agentName)
		if err == nil {
			return pod, nil
		}
		lastErr = err

		select {
		case <-ctx.Done():
			if lastErr != nil {
				return kube.PodRef{}, lastErr
			}
			return kube.PodRef{}, ctx.Err()
		case <-ticker.C:
		}
	}
}

func waitForTemplateHealthcheck(
	ctx context.Context,
	clientset kubernetes.Interface,
	factory *kube.Factory,
	agentName string,
	templateDef agenttemplate.Definition,
) error {
	healthcheckScript, err := readTemplateScript(templateDef.Healthcheck.Script, templateDef.HealthcheckScriptPath())
	if err != nil {
		return err
	}

	deadline := time.Now().Add(time.Duration(templateDef.Healthcheck.TimeoutSeconds) * time.Second)
	var lastErr error

	for {
		remaining := time.Until(deadline)
		if remaining <= 0 {
			if lastErr != nil {
				return fmt.Errorf("healthcheck did not pass before timeout: %w", lastErr)
			}
			return fmt.Errorf("healthcheck did not pass before timeout")
		}

		attemptCtx, cancel := context.WithTimeout(ctx, minDuration(remaining, 10*time.Second))
		lastErr = executeTemplateScriptContent(
			attemptCtx,
			clientset,
			factory,
			agentName,
			templateDef.Healthcheck.Script,
			healthcheckScript,
			0,
		)
		cancel()
		if lastErr == nil {
			return nil
		}

		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(bootstrapPollInterval):
		}
	}
}

func executeTemplateScript(
	ctx context.Context,
	clientset kubernetes.Interface,
	factory *kube.Factory,
	agentName string,
	scriptName string,
	scriptPath string,
	timeoutSeconds int,
) error {
	raw, err := readTemplateScript(scriptName, scriptPath)
	if err != nil {
		return err
	}

	return executeTemplateScriptContent(
		ctx,
		clientset,
		factory,
		agentName,
		scriptName,
		raw,
		timeoutSeconds,
	)
}

func readTemplateScript(scriptName, scriptPath string) ([]byte, error) {
	raw, err := os.ReadFile(scriptPath)
	if err != nil {
		return nil, fmt.Errorf("read %s: %w", scriptName, err)
	}
	return raw, nil
}

func executeTemplateScriptContent(
	ctx context.Context,
	clientset kubernetes.Interface,
	factory *kube.Factory,
	agentName string,
	scriptName string,
	raw []byte,
	timeoutSeconds int,
) error {
	execCtx := ctx
	var cancel context.CancelFunc
	if timeoutSeconds > 0 {
		execCtx, cancel = context.WithTimeout(ctx, time.Duration(timeoutSeconds)*time.Second)
		defer cancel()
	}

	command := []string{"bash", "-se"}

	stdout, stderr, err := execInAgentPodWithRetry(
		execCtx,
		clientset,
		factory,
		agentName,
		command,
		raw,
		false,
		nil,
	)
	if err != nil {
		return fmt.Errorf(
			"%s failed: %w (stdout=%q stderr=%q)",
			scriptName,
			err,
			stdout,
			stderr,
		)
	}

	return nil
}

func persistBootstrapStatus(ctx context.Context, repo *kube.Repository, agentName, phase, message string) error {
	return retry.RetryOnConflict(retry.DefaultRetry, func() error {
		devbox, err := repo.Get(ctx, agentName)
		if err != nil {
			return err
		}
		if err := kube.SetBootstrapStatus(devbox, phase, truncateBootstrapMessage(message)); err != nil {
			return err
		}
		_, err = repo.Update(ctx, devbox)
		return err
	})
}

func truncateBootstrapMessage(message string) string {
	const maxLength = 1024
	trimmed := strings.TrimSpace(message)
	if len(trimmed) <= maxLength {
		return trimmed
	}
	return trimmed[:maxLength]
}

func minDuration(left, right time.Duration) time.Duration {
	if left < right {
		return left
	}
	return right
}

func bootstrapTemplateID(templateID string) string {
	return strings.TrimSpace(templateID)
}

func updateBootstrapMetadata(devbox *unstructured.Unstructured, templateID string) error {
	if strings.TrimSpace(templateID) == "" {
		return fmt.Errorf("template id is required")
	}
	if err := kube.SetTemplateID(devbox, bootstrapTemplateID(templateID)); err != nil {
		return err
	}
	return kube.SetBootstrapStatus(devbox, kube.BootstrapPhasePending, "等待实例初始化")
}
