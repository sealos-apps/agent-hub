import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AgentConfigForm } from "../../../components/business/agents/AgentConfigForm";
import { Button } from "../../../components/ui/Button";
import { useI18n } from "../../../i18n";
import { AgentCreateSidebar } from "./components/AgentCreateSidebar";
import { AgentHubOverview } from "./components/AgentHubOverview";
import { AgentWorkspaceShell } from "./components/AgentWorkspaceShell";
import { useAgentHub } from "./hooks/AgentHubControllerContext";
import { applyBlueprintPreset, updateBlueprintField } from "./lib/blueprint";
import { createEmptyBlueprint } from "../../../domains/agents/templates";
import { writeBlueprintSettingValue } from "../../../domains/agents/blueprintFields";
import type { AgentBlueprint } from "../../../domains/agents/types";

export function AgentCreatePage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const controller = useAgentHub();
  const {
    clusterContext,
    loading,
    message,
    submitting,
    templates,
    workspaceRegion,
    workspaceAIProxyModelBaseURL,
    workspaceAIProxyToken,
    prepareCreateBlueprint,
    createAgentFromBlueprint,
    findTemplateById,
    setMessage,
  } = controller;
  const [blueprint, setBlueprint] = useState<AgentBlueprint>(() =>
    createEmptyBlueprint(),
  );
  const mainColumnRef = useRef<HTMLElement | null>(null);
  const preparedBlueprintKeyRef = useRef("");
  const [syncedSidebarHeight, setSyncedSidebarHeight] = useState<number | null>(
    null,
  );
  const selectedTemplateId = useMemo(
    () => String(searchParams.get("template") || "").trim(),
    [searchParams],
  );
  const selectedTemplate = findTemplateById(selectedTemplateId);

  useEffect(() => {
    if (!selectedTemplateId) {
      navigate("/agents/templates", { replace: true });
    }
  }, [navigate, selectedTemplateId]);

  useEffect(() => {
    if (loading) return;
    if (!selectedTemplateId) return;
    if (!selectedTemplate && templates.length > 0) {
      navigate("/agents/templates", { replace: true });
    }
  }, [
    loading,
    navigate,
    selectedTemplate,
    selectedTemplateId,
    templates.length,
  ]);

  useEffect(() => {
    if (!selectedTemplateId || !clusterContext) return;

    const prepareKey = [
      selectedTemplateId,
      clusterContext.namespace,
      workspaceAIProxyModelBaseURL,
    ].join(":");
    if (preparedBlueprintKeyRef.current === prepareKey) {
      return;
    }
    preparedBlueprintKeyRef.current = prepareKey;

    let disposed = false;

    void prepareCreateBlueprint(selectedTemplateId)
      .then((nextBlueprint) => {
        if (disposed) return;
        setBlueprint(nextBlueprint);
      })
      .catch((error) => {
        if (disposed) return;
        preparedBlueprintKeyRef.current = "";
        setMessage(error instanceof Error ? error.message : t('agent.createTemplateFailed'));
      });

    return () => {
      disposed = true;
    };
  }, [
    clusterContext,
    prepareCreateBlueprint,
    selectedTemplateId,
    setMessage,
    workspaceAIProxyModelBaseURL,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const mainColumn = mainColumnRef.current;
    if (!mainColumn) return;

    const syncHeight = () => {
      if (window.innerWidth < 1280) {
        setSyncedSidebarHeight(null);
        return;
      }
      const next = Math.ceil(mainColumn.getBoundingClientRect().height);
      setSyncedSidebarHeight(next > 0 ? next : null);
    };

    syncHeight();

    const resizeObserver = new ResizeObserver(() => {
      syncHeight();
    });
    resizeObserver.observe(mainColumn);
    window.addEventListener("resize", syncHeight);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", syncHeight);
    };
  }, [selectedTemplateId, loading, clusterContext, selectedTemplate]);

  const handleBlueprintChange = <K extends keyof AgentBlueprint>(
    field: K,
    value: AgentBlueprint[K],
  ) => {
    setBlueprint((current) => updateBlueprintField(current, field, value));
  };

  const handleSelectPreset = (presetId: AgentBlueprint["profile"]) => {
    setBlueprint((current) => applyBlueprintPreset(current, presetId));
  };

  const handleSubmit = async () => {
    try {
      await createAgentFromBlueprint(blueprint);
      navigate("/agents");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t('agent.submitFailed'));
    }
  };

  const blueprintReady = Boolean(
    selectedTemplateId &&
    clusterContext &&
    blueprint.productType === selectedTemplateId &&
    blueprint.namespace === clusterContext.namespace,
  );
  const waitingForBlueprint =
    loading ||
    (Boolean(selectedTemplateId) && Boolean(clusterContext) && !blueprintReady);
  const missingClusterContext = !loading && !clusterContext;

  return (
    <AgentWorkspaceShell
      headerActions={
        <div className="grid w-full grid-cols-2 gap-2 md:flex md:w-auto md:items-center md:justify-end">
          <Button
            className="h-10 w-full min-w-0 px-3 md:hidden"
            onClick={() => navigate("/agents/templates")}
            size="md"
            variant="secondary"
          >
            {t('agent.changeTemplate')}
          </Button>
          <Button
            className="h-10 w-full min-w-0 px-3 md:w-auto md:min-w-[124px]"
            disabled={submitting || waitingForBlueprint || missingClusterContext}
            onClick={handleSubmit}
            size="md"
            variant="primary"
          >
            {submitting ? t('common.deploying') : t('common.confirmDeploy')}
          </Button>
        </div>
      }
    >
      <div className="flex h-full min-w-0 flex-col">
        <main className="flex min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto flex w-full max-w-[1760px] min-h-full flex-col gap-4 px-4 pb-10 pt-4 sm:px-6 sm:pb-12 lg:px-8 lg:pb-6 xl:px-10 2xl:px-12">
            <AgentHubOverview message={message} onClose={() => setMessage("")} />

            <div className="grid w-full gap-3 lg:grid-cols-[240px_minmax(0,1fr)] xl:grid-cols-[252px_minmax(0,1fr)] 2xl:grid-cols-[264px_minmax(0,1fr)]">
              {selectedTemplate ? (
                <div
                  className="hidden min-w-0 lg:block lg:w-[240px] xl:w-[252px] 2xl:w-[264px]"
                  style={
                    syncedSidebarHeight
                      ? { height: `${syncedSidebarHeight}px` }
                      : undefined
                  }
                >
                  <AgentCreateSidebar
                    blueprint={blueprint}
                    template={selectedTemplate}
                    workspaceModelBaseURL={workspaceAIProxyModelBaseURL}
                    workspaceModelKeyReady={Boolean(workspaceAIProxyToken?.key)}
                  />
                </div>
              ) : null}

              <section
                ref={mainColumnRef}
                className="min-w-0 w-full max-w-[820px] justify-self-center lg:h-full lg:max-w-none lg:justify-self-auto"
              >
                {waitingForBlueprint ? (
                  <div className="workbench-card-strong flex min-h-[420px] flex-col items-center justify-center px-6 py-8 text-center">
                    <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-400">
                      {t('agent.preparing')}
                    </div>
                    <div className="mt-2 text-[1.35rem]/8 font-semibold tracking-[-0.03em] text-zinc-950">
                      {t('agent.preparingConfig')}
                    </div>
                    <div className="mt-2 max-w-[28rem] text-[13px]/6 text-zinc-500">
                      {t('agent.preparingConfigDesc')}
                    </div>
                  </div>
                ) : missingClusterContext ? (
                  <div className="workbench-card-strong flex min-h-[420px] flex-col items-center justify-center px-6 py-8 text-center">
                    <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-400">
                      {t('agent.unavailable')}
                    </div>
                    <div className="mt-2 text-[1.35rem]/8 font-semibold tracking-[-0.03em] text-zinc-950">
                      {t('agent.workspaceNotReady')}
                    </div>
                    <div className="mt-2 max-w-[30rem] text-[13px]/6 text-zinc-500">
                      {t('agent.workspaceNotReadyDesc')}
                    </div>
                    <div className="mt-5">
                      <Button
                        className="rounded-xl"
                        onClick={() => navigate("/agents")}
                        size="md"
                        variant="secondary"
                      >
                        {t('nav.backAgentList')}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <AgentConfigForm
                    blueprint={blueprint}
                    onChange={handleBlueprintChange}
                    onChangeSettingField={(field, value) => {
                      setBlueprint((current) =>
                        writeBlueprintSettingValue(current, field, value),
                      );
                    }}
                    onChangeTemplate={() => navigate("/agents/templates")}
                    onSelectPreset={handleSelectPreset}
                    template={selectedTemplate}
                    workspaceRegion={workspaceRegion}
                  />
                )}
              </section>
            </div>
          </div>
        </main>
      </div>
    </AgentWorkspaceShell>
  );
}
