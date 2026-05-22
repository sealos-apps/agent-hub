import { ArrowUpRight, Globe } from "lucide-react";
import { Button } from "../../ui/Button";

interface AgentWebUIWorkspaceProps {
  url: string;
  reason?: string;
}

export function AgentWebUIWorkspace({ url, reason }: AgentWebUIWorkspaceProps) {
  if (!url) {
    return (
      <div className="flex h-full min-h-[320px] flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center shadow-sm">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-500">
          <Globe size={22} />
        </div>
        <div className="mt-4 text-base font-medium text-slate-950">
          Web UI 工作台
        </div>
        <p className="mt-2 max-w-lg text-sm leading-6 text-slate-500">
          {reason || "当前实例暂时没有可用的 Web UI 地址。"}
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-[460px] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <div className="min-w-0">
          <div className="text-sm font-medium text-slate-950">Web UI</div>
          <div className="mt-1 truncate font-mono text-xs text-slate-400">
            {url}
          </div>
        </div>
        <Button
          onClick={() => {
            if (typeof window === "undefined") return;
            window.open(url, "_blank", "noopener,noreferrer");
          }}
          type="button"
          variant="secondary"
        >
          <ArrowUpRight size={16} />
          新窗口打开
        </Button>
      </div>

      <div className="min-h-0 flex-1 bg-slate-50 p-3">
        <iframe
          className="h-full min-h-[360px] w-full rounded-xl border border-slate-200 bg-white"
          referrerPolicy="strict-origin-when-cross-origin"
          src={url}
          title="Agent Web UI"
        />
      </div>
    </div>
  );
}
