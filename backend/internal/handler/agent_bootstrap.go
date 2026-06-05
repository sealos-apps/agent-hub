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
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/util/retry"
)

const bootstrapPollInterval = 3 * time.Second

type bootstrapDynamicFactory func(*kube.Factory) (dynamic.Interface, error)
type bootstrapKubernetesFactory func(*kube.Factory) (kubernetes.Interface, error)

var bootstrapDynamicClient bootstrapDynamicFactory = func(factory *kube.Factory) (dynamic.Interface, error) {
	return factory.Dynamic()
}

var bootstrapKubernetesClient bootstrapKubernetesFactory = func(factory *kube.Factory) (kubernetes.Interface, error) {
	return factory.Kubernetes()
}

var readTemplateScriptFile = readTemplateScript

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
	dynamicClient, err := bootstrapDynamicClient(factory)
	if err != nil {
		return fmt.Errorf("build dynamic client: %w", err)
	}
	clientset, err := bootstrapKubernetesClient(factory)
	if err != nil {
		return fmt.Errorf("build kubernetes clientset: %w", err)
	}

	repo := kube.NewRepository(dynamicClient, factory.Namespace())
	if err := persistBootstrapStatus(ctx, repo, spec.Name, kube.BootstrapPhaseRunning, "waiting_for_instance"); err != nil {
		return err
	}

	if _, err := waitForAgentPod(ctx, clientset, factory, spec.Name); err != nil {
		_ = persistBootstrapStatus(context.Background(), repo, spec.Name, kube.BootstrapPhaseFailed, "instance_start_timeout")
		return err
	}

	if agenttemplate.HasScriptSpec(templateDef.Bootstrap) {
		if err := persistBootstrapStatus(ctx, repo, spec.Name, kube.BootstrapPhaseRunning, "running_template_bootstrap"); err != nil {
			return err
		}

		if err := executeTemplateScript(ctx, clientset, factory, spec.Name, templateDef.Bootstrap.Script, templateDef.BootstrapScriptPath(), templateDef.Bootstrap.TimeoutSeconds); err != nil {
			if fallbackErr := runBootstrapFallback(ctx, factory, spec, err); fallbackErr != nil {
				message := truncateBootstrapMessage(fallbackErr.Error())
				_ = persistBootstrapStatus(context.Background(), repo, spec.Name, kube.BootstrapPhaseFailed, message)
				return fallbackErr
			}
		}
	}

	latestSpec, err := bootstrapAgentSpec(ctx, repo, spec.Name)
	if err != nil {
		message := truncateBootstrapMessage(err.Error())
		_ = persistBootstrapStatus(context.Background(), repo, spec.Name, kube.BootstrapPhaseFailed, message)
		return err
	}

	if err := syncAgentBootstrapModelConfig(ctx, clientset, factory, latestSpec, templateDef, cfg.Region); err != nil {
		message := truncateBootstrapMessage(err.Error())
		_ = persistBootstrapStatus(context.Background(), repo, spec.Name, kube.BootstrapPhaseFailed, message)
		return err
	}

	if agenttemplate.HasScriptSpec(templateDef.Healthcheck) {
		if err := persistBootstrapStatus(ctx, repo, spec.Name, kube.BootstrapPhaseRunning, "waiting_for_health_check"); err != nil {
			return err
		}

		if err := waitForTemplateHealthcheck(ctx, clientset, factory, spec.Name, templateDef); err != nil {
			message := truncateBootstrapMessage(err.Error())
			_ = persistBootstrapStatus(context.Background(), repo, spec.Name, kube.BootstrapPhaseFailed, message)
			return err
		}
	}

	if err := persistBootstrapStatus(ctx, repo, spec.Name, kube.BootstrapPhaseReady, "bootstrap_ready"); err != nil {
		return err
	}

	return nil
}

func bootstrapAgentSpec(ctx context.Context, repo *kube.Repository, agentName string) (agent.Agent, error) {
	devbox, err := repo.Get(ctx, agentName)
	if err != nil {
		return agent.Agent{}, fmt.Errorf("read agent after bootstrap script: %w", err)
	}
	view, err := kube.DevboxToAgentView(devbox)
	if err != nil {
		return agent.Agent{}, fmt.Errorf("read agent model metadata after bootstrap script: %w", err)
	}
	return view.Agent, nil
}

func runBootstrapFallback(ctx context.Context, factory *kube.Factory, spec agent.Agent, bootstrapErr error) error {
	if strings.TrimSpace(spec.TemplateID) != "hermes-agent" {
		return fmt.Errorf("template bootstrap failed: %w", bootstrapErr)
	}

	if err := configureHermesModel(ctx, factory, spec); err != nil {
		return fmt.Errorf("template bootstrap failed: %w; hermes fallback failed: %v", bootstrapErr, err)
	}

	log.Printf("template bootstrap failed for %s/%s, recovered via Hermes fallback: %v", factory.Namespace(), spec.Name, bootstrapErr)
	return nil
}

func waitForTemplateHealthcheck(
	ctx context.Context,
	clientset kubernetes.Interface,
	factory *kube.Factory,
	agentName string,
	templateDef agenttemplate.Definition,
) error {
	healthcheckScript, err := readTemplateScriptFile(templateDef.Healthcheck.Script, templateDef.HealthcheckScriptPath())
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
	raw, err := readTemplateScriptFile(scriptName, scriptPath)
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

	stdout, stderr, err := execAgentCommandWithRetry(
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
	return kube.SetBootstrapStatus(devbox, kube.BootstrapPhasePending, "waiting_for_bootstrap")
}
