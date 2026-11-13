import { useEffect } from "react";
import { Icon } from "../../../ui/Icon";
import { t, tf, track } from "../lib/env.ts";
import { subscriptionKey } from "../lib/subscriptionsClient.ts";
import type { SubTarget } from "../types.ts";

// The bell. One component for every subscribe affordance in the modal so
// the two states — offering and following — never drift apart between the
// season row and the empty states.
//
// `target` is {kind, videoId, season, source}; `subscriptionKeys` is the Set
// DiscoverApp keeps. Rendering nothing when there is no target is deliberate:
// a library item or a series opened without an episode has nothing a poller
// could search for.
export function SubscribeButton({
  target,
  subscriptionKeys,
  onToggle,
  size = "sm",
}: {
  target: SubTarget | null;
  subscriptionKeys: Set<string>;
  onToggle: (target: SubTarget) => void;
  size?: "sm" | "xs";
}) {
  // The offer was shown: the denominator for release-sub-created, per
  // surface (target.source). Once per mount — reopening the modal is a new
  // look at the offer, a re-render of the same open modal is not.
  const videoId = target?.videoId;
  useEffect(() => {
    if (!target || !videoId) return;
    track("release-sub-seen", {
      kind: target.kind,
      id: videoId,
      season: target.season,
      source: target.source || "other",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.kind, videoId, target?.season, target?.source]);

  if (!target || !target.videoId) return null;

  const key = subscriptionKey(target.kind, target.videoId, target.season);
  const subscribed = subscriptionKeys.has(key);

  const label = subscribed ? t("discover.subscriptions.unsubscribe") : t("discover.subscriptions.subscribe");
  const title = target.kind === "season" ? tf("discover.subscriptions.seasonTitle", target.season ?? "") : label;

  return (
    <button
      type="button"
      title={title}
      aria-pressed={subscribed}
      onClick={(event) => {
        event.stopPropagation();
        onToggle(target);
      }}
      className={["button", size === "xs" ? "small" : "", subscribed ? "on" : "accent"].filter(Boolean).join(" ")}
    >
      <Icon name="bell" size={16} fill={subscribed ? "currentColor" : "none"} />
      {label}
    </button>
  );
}

// OnAirDot marks a season that is still being broadcast: a small olive dot
// inside a season chip that is already only two characters wide. Still,
// not pulsing — motion here would answer no action.
export function OnAirDot() {
  return <span className="d-onair" aria-hidden="true" />;
}
