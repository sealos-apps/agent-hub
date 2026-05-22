import { buildAuthorizedRequestOptions } from "./shared";
import type {
  AgentConsoleBootstrap,
  AgentContract,
  AgentHubRegion,
  AgentSSHAccessPayload,
  AgentTemplateCatalogItem,
  ClusterContext,
  SystemConfig,
} from "../domains/agents/types";

interface BackendEnvelope<T> {
  code?: number;
  data?: T;
  message?: string;
  error?: {
    type?: string;
    message?: string;
    details?: Record<string, unknown>;
  };
  requestId?: string;
}

interface BackendRequestError extends Error {
  status?: number;
  payload?: unknown;
  requestId?: string;
}

export type ChatStreamEvent = {
  type: string;
  transport: string;
  payload?: unknown;
};

type ChatStreamPayload = {
  model: string;
  stream: boolean;
  messages: Array<{ role: string; content: string }>;
};

const BACKEND_BASE_URL =
  import.meta.env.VITE_AGENTHUB_BACKEND_URL ||
  (import.meta.env.DEV ? "/backend-api" : "/");

const joinUrlPath = (basePath = "", nextPath = "") => {
  const normalizedBase = String(basePath || "").replace(/\/$/, "");
  const normalizedNext = String(nextPath || "").replace(/^\//, "");
  if (!normalizedBase) return `/${normalizedNext}`;
  if (!normalizedNext) return normalizedBase || "/";
  return `${normalizedBase}/${normalizedNext}`;
};

const buildBackendUrl = (path = "") => {
  if (typeof window === "undefined") {
    return `${BACKEND_BASE_URL.replace(/\/$/, "")}/${String(path || "").replace(/^\//, "")}`;
  }

  const target = new URL(BACKEND_BASE_URL, window.location.origin);
  target.pathname = joinUrlPath(target.pathname, path);
  return target.toString();
};

const buildBackendWsUrl = (path = "") => {
  const target = new URL(buildBackendUrl(path));
  target.protocol = target.protocol === "https:" ? "wss:" : "ws:";
  return target.toString();
};

const createBackendError = (response: Response, payload: unknown) => {
  const normalizedPayload = payload as BackendEnvelope<unknown> | string | null;
  const detailMessage = (() => {
    if (!normalizedPayload || typeof normalizedPayload !== "object") return "";
    const details = normalizedPayload.error?.details;
    if (!details || typeof details !== "object") return "";
    const field = String(details.field || "").trim();
    const reason = String(details.reason || "").trim();
    const parts = [field, reason].filter(Boolean);
    if (!parts.length) return "";
    return `(${parts.join(" | ")})`;
  })();
  const message =
    (typeof normalizedPayload === "object" && normalizedPayload
      ? normalizedPayload.message || normalizedPayload.error?.message
      : "") ||
    (typeof normalizedPayload === "string" ? normalizedPayload : "") ||
    `请求失败: ${response.status}`;

  const error: BackendRequestError = new Error(message);
  if (detailMessage) {
    error.message = `${message} ${detailMessage}`.trim();
  }
  error.status = response.status;
  error.payload = payload;
  error.requestId =
    typeof normalizedPayload === "object" && normalizedPayload
      ? normalizedPayload.requestId || ""
      : "";
  return error;
};

const normalizeSystemRegion = (value = ""): AgentHubRegion => {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (normalized === "cn") {
    return "cn";
  }
  if (normalized === "us") {
    return "us";
  }
  throw new Error("系统配置缺少合法 REGION，只允许 cn 或 us。");
};

const expectData = <T>(payload: T | null, message: string): T => {
  if (payload == null) {
    throw new Error(message);
  }
  return payload;
};

export const requestBackend = async <T = unknown>(
  path: string,
  clusterContext: ClusterContext | null,
  options: RequestInit = {},
): Promise<T | null> => {
  const response = await fetch(
    buildBackendUrl(path),
    buildAuthorizedRequestOptions(clusterContext, options),
  );
  const text = await response.text().catch(() => "");

  let payload: BackendEnvelope<T> | string | null = null;
  if (text) {
    try {
      payload = JSON.parse(text) as BackendEnvelope<T>;
    } catch {
      payload = text;
    }
  }

  if (!response.ok) {
    throw createBackendError(response, payload);
  }

  if (!payload || typeof payload !== "object") {
    return null;
  }

  if (payload.code !== 0) {
    throw createBackendError(response, payload);
  }

  return payload.data ?? null;
};

export const listAgents = async (clusterContext: ClusterContext) =>
  requestBackend<{ items: AgentContract[]; total: number }>(
    "/api/v1/agents",
    clusterContext,
    { method: "GET" },
  );

export const listAgentTemplates = async (): Promise<{
  items: AgentTemplateCatalogItem[];
  region: AgentHubRegion;
}> => {
  const payload = await requestBackend<{
    items: AgentTemplateCatalogItem[];
    region: AgentHubRegion;
  }>("/api/v1/templates", null, { method: "GET" });
  return {
    items: Array.isArray(payload?.items) ? payload.items : [],
    region: normalizeSystemRegion(payload?.region),
  };
};

export const getSystemConfig = async (): Promise<SystemConfig> => {
  const payload = await requestBackend<{
    region: AgentHubRegion;
    sshDomain: string;
    aiProxyModelBaseURL: string;
  }>("/api/v1/system/config", null, { method: "GET" });
  return {
    region: normalizeSystemRegion(payload?.region),
    sshDomain: String(payload?.sshDomain || "").trim(),
    aiProxyModelBaseURL: String(payload?.aiProxyModelBaseURL || "").trim(),
  };
};

export const getAgent = async (
  agentName: string,
  clusterContext: ClusterContext,
): Promise<{ agent: AgentContract }> =>
  expectData(
    await requestBackend<{ agent: AgentContract }>(
      `/api/v1/agents/${encodeURIComponent(agentName)}`,
      clusterContext,
      {
        method: "GET",
      },
    ),
    "Agent 详情响应为空。",
  );

export const getAgentConsole = async (
  agentName: string,
  clusterContext: ClusterContext,
): Promise<AgentConsoleBootstrap> =>
  expectData(
    await requestBackend<AgentConsoleBootstrap>(
      `/api/v1/agents/${encodeURIComponent(agentName)}/console`,
      clusterContext,
      {
        method: "GET",
      },
    ),
    "Agent 控制台响应为空。",
  );

export const createAgent = async (
  payload: Record<string, unknown>,
  clusterContext: ClusterContext,
): Promise<{ agent: AgentContract }> =>
  expectData(
    await requestBackend<{ agent: AgentContract }>(
      "/api/v1/agents",
      clusterContext,
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    ),
    "创建 Agent 响应为空。",
  );

export const updateAgent = async (
  agentName: string,
  payload: Record<string, string>,
  clusterContext: ClusterContext,
): Promise<{ agent: AgentContract }> =>
  expectData(
    await requestBackend<{ agent: AgentContract }>(
      `/api/v1/agents/${encodeURIComponent(agentName)}`,
      clusterContext,
      {
        method: "PATCH",
        body: JSON.stringify(payload),
      },
    ),
    "更新 Agent 响应为空。",
  );

export const updateAgentRuntime = async (
  agentName: string,
  payload: Record<string, string>,
  clusterContext: ClusterContext,
): Promise<{ agent: AgentContract }> =>
  expectData(
    await requestBackend<{ agent: AgentContract }>(
      `/api/v1/agents/${encodeURIComponent(agentName)}/runtime`,
      clusterContext,
      {
        method: "PATCH",
        body: JSON.stringify(payload),
      },
    ),
    "更新 Agent 运行时响应为空。",
  );

export const updateAgentSettings = async (
  agentName: string,
  payload: {
    "agent-alias-name"?: string;
    settings?: Record<string, unknown>;
  },
  clusterContext: ClusterContext,
): Promise<{ agent: AgentContract }> =>
  expectData(
    await requestBackend<{ agent: AgentContract }>(
      `/api/v1/agents/${encodeURIComponent(agentName)}/settings`,
      clusterContext,
      {
        method: "PATCH",
        body: JSON.stringify(payload),
      },
    ),
    "更新 Agent 设置响应为空。",
  );

export const deleteAgent = async (
  agentName: string,
  clusterContext: ClusterContext,
) =>
  requestBackend(
    `/api/v1/agents/${encodeURIComponent(agentName)}`,
    clusterContext,
    { method: "DELETE" },
  );

export const runAgent = async (
  agentName: string,
  clusterContext: ClusterContext,
) =>
  requestBackend(
    `/api/v1/agents/${encodeURIComponent(agentName)}/run`,
    clusterContext,
    { method: "POST" },
  );

export const pauseAgent = async (
  agentName: string,
  clusterContext: ClusterContext,
) =>
  requestBackend(
    `/api/v1/agents/${encodeURIComponent(agentName)}/pause`,
    clusterContext,
    { method: "POST" },
  );

export const rotateAgentKey = async (
  agentName: string,
  clusterContext: ClusterContext,
) =>
  requestBackend(
    `/api/v1/agents/${encodeURIComponent(agentName)}/key/rotate`,
    clusterContext,
    { method: "POST" },
  );

export const getAgentSSHAccess = async (
  agentName: string,
  clusterContext: ClusterContext,
): Promise<AgentSSHAccessPayload> =>
  expectData(
    await requestBackend<AgentSSHAccessPayload>(
      `/api/v1/agents/${encodeURIComponent(agentName)}/access/ssh`,
      clusterContext,
      {
        method: "GET",
      },
    ),
    "SSH 接入响应为空。",
  );

export const ensureAIProxyToken = async (
  clusterContext: ClusterContext,
  payload: Record<string, unknown> = {},
) =>
  requestBackend("/api/v1/aiproxy/token/ensure", clusterContext, {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const buildAgentWebSocketUrl = (agentName: string) =>
  buildBackendWsUrl(`/api/v1/agents/${encodeURIComponent(agentName)}/ws`);

export const streamAgentChatCompletions = async (
  {
    agentName,
    payload,
    onEvent,
  }: {
    agentName: string;
    payload: ChatStreamPayload;
    onEvent?: (event: ChatStreamEvent) => void;
  },
  clusterContext: ClusterContext,
) => {
  const response = await fetch(
    buildBackendUrl(
      `/api/v1/agents/${encodeURIComponent(agentName)}/chat/completions`,
    ),
    buildAuthorizedRequestOptions(clusterContext, {
      method: "POST",
      headers: {
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify(payload),
    }),
  );

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(errorText || `聊天请求失败: ${response.status}`);
  }

  if (!response.body) {
    throw new Error(`聊天响应为空: ${response.status}`);
  }

  const emit = (event: ChatStreamEvent) => {
    onEvent?.(event);
  };

  const contentType = response.headers.get("content-type") || "";
  emit({ type: "open", transport: "sse" });

  if (!contentType.includes("text/event-stream")) {
    const data = await response
      .json()
      .catch(async () => ({
        choices: [
          { message: { content: await response.text().catch(() => "") } },
        ],
      }));
    emit({ type: "message", transport: "sse", payload: data });
    emit({ type: "done", transport: "sse" });
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() || "";

    for (const chunk of chunks) {
      const lines = chunk.split("\n").filter(Boolean);
      const dataLine = lines.find((line) => line.startsWith("data:"));
      if (!dataLine) continue;

      const raw = dataLine.slice(5).trim();
      if (!raw || raw === "[DONE]") {
        emit({ type: "done", transport: "sse" });
        continue;
      }

      try {
        emit({ type: "message", transport: "sse", payload: JSON.parse(raw) });
      } catch {
        emit({ type: "message", transport: "sse", payload: { content: raw } });
      }
    }
  }

  emit({ type: "done", transport: "sse" });
};
