import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AgentConfigForm } from "../../../components/business/agents/AgentConfigForm";
import { Button } from "../../../components/ui/Button";
import { AgentCreateSidebar } from "./components/AgentCreateSidebar";
import { AgentHubOverview } from "./components/AgentHubOverview";
import { AgentWorkspaceShell } from "./components/AgentWorkspaceShell";
import { useAgentHub } from "./hooks/AgentHubControllerContext";
import { applyBlueprintPreset, updateBlueprintField } from "./lib/blueprint";
import { buildAgentDetailRouteState } from "./lib/navigation";
import { createEmptyBlueprint } from "../../../domains/agents/templates";
import { writeBlueprintSettingValue } from "../../../domains/agents/blueprintFields";
import type { AgentBlueprint } from "../../../domains/agents/types";

export function AgentCreatePage() {
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
        setMessage(error instanceof Error ? error.message : "加载创建模板失败");
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

  const handleBlueprintChange = (
    field: keyof AgentBlueprint,
    value: string,
  ) => {
    setBlueprint((current) => updateBlueprintField(current, field, value));
  };

  const handleSelectPreset = (presetId: AgentBlueprint["profile"]) => {
    setBlueprint((current) => applyBlueprintPreset(current, presetId));
  };

  const handleSubmit = async () => {
    try {
      const result = await createAgentFromBlueprint(blueprint);
      navigate(`/agents/${result.agentName}`, {
        state: buildAgentDetailRouteState(result.item || null, "create"),
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "提交失败");
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
        <>
          <Button
            className="min-w-[124px]"
            onClick={() => navigate("/agents/templates")}
            size="md"
            variant="secondary"
          >
            更换模板
          </Button>
          <Button
            className="min-w-[124px]"
            disabled={submitting || waitingForBlueprint || missingClusterContext}
            onClick={handleSubmit}
            size="md"
            variant="primary"
          >
            {submitting ? "部署中..." : "确认部署"}
          </Button>
        </>
      }
    >
      <div className="flex h-full min-w-0 flex-col">
        <main className="flex min-h-0 flex-1 overflow-y-auto">
          <div className="flex w-full min-h-full flex-col gap-5 px-4 pb-12 pt-5 sm:px-6 sm:pb-14 lg:px-12 lg:pb-10">
            <AgentHubOverview message={message} onClose={() => setMessage("")} />

            <div className="grid w-full gap-3 lg:grid-cols-[280px_minmax(0,1fr)] xl:grid-cols-[300px_minmax(0,1fr)] 2xl:grid-cols-[320px_minmax(0,1fr)]">
              {selectedTemplate ? (
                <div
                  className="min-w-0 lg:w-[280px] xl:w-[300px] 2xl:w-[320px]"
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
                      正在准备
                    </div>
                    <div className="mt-2 text-[1.35rem]/8 font-semibold tracking-[-0.03em] text-zinc-950">
                      正在准备创建配置
                    </div>
                    <div className="mt-2 max-w-[28rem] text-[13px]/6 text-zinc-500">
                      正在读取模板与默认配置，请稍候。
                    </div>
                  </div>
                ) : missingClusterContext ? (
                  <div className="workbench-card-strong flex min-h-[420px] flex-col items-center justify-center px-6 py-8 text-center">
                    <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-400">
                      暂时不可用
                    </div>
                    <div className="mt-2 text-[1.35rem]/8 font-semibold tracking-[-0.03em] text-zinc-950">
                      当前工作区还没准备好
                    </div>
                    <div className="mt-2 max-w-[30rem] text-[13px]/6 text-zinc-500">
                      请先返回列表页再重新进入，然后继续创建。
                    </div>
                    <div className="mt-5">
                      <Button
                        className="rounded-xl"
                        onClick={() => navigate("/agents")}
                        size="md"
                        variant="secondary"
                      >
                        返回列表页
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
