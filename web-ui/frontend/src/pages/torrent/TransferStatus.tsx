import { useEffect, useState } from "react";
import { Icon, type IconName } from "../../ui/Icon";
import type { StatusView } from "./types";

const ICONS: Record<string, IconName> = {
  cached: "check",
  vault: "vault",
  vaulted: "vault",
  caching: "download",
  swarm: "wifi",
  err: "alert",
  warn: "alert",
};

/**
 * Where the bytes come from, live: the first view the server rendered, then
 * every message of the status stream (GET /:id/status).
 */
export function TransferStatus({ view: first, streamUrl }: { view: StatusView; streamUrl: string }) {
  const [view, setView] = useState(first);
  useEffect(() => setView(first), [first]);
  useEffect(() => {
    const source = new EventSource(streamUrl, { withCredentials: true });
    source.addEventListener("message", (event) => {
      try {
        const status = JSON.parse((event as MessageEvent).data);
        if (status?.view) setView(status.view as StatusView);
      } catch {
        /* skipped, as the classic page did */
      }
    });
    return () => source.close();
  }, [streamUrl]);

  const tone = view.badge.tone || "off";
  const chain = view.mode === "chain";
  return (
    <div className={`transfer tone-${tone}`}>
      <div className="transfer-row">
        <span className={view.badge.pulse ? "transfer-badge pulse" : "transfer-badge"}>
          <Icon name={ICONS[view.badge.icon] ?? ICONS[tone] ?? "info"} size={15} />
          {view.badge.label}
          {view.badge.extra && <span className="muted"> · {view.badge.extra}</span>}
        </span>
        {chain && (
          <ol className="transfer-chain" aria-label={view.badge.label}>
            {view.nodes.map((node, index) =>
              node.show ? (
                <li key={node.kind} className={node.dim ? "dim" : undefined}>
                  <span className="node-name">{node.name}</span>
                  {node.value && <span className="node-value mono">{node.value}</span>}
                  {index < view.segs.length && view.segs[index]?.show && view.segs[index].speed && (
                    <span className="node-speed mono">→ {view.segs[index].speed}</span>
                  )}
                </li>
              ) : null,
            )}
          </ol>
        )}
      </div>
      {view.hint && <p className="transfer-hint">{view.hint}</p>}
    </div>
  );
}
