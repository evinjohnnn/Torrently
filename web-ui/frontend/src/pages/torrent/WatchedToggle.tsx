import { useNavigation } from "../../app/router";
import { useI18n } from "../../i18n";
import { Icon } from "../../ui/Icon";
import { formData } from "../../app/api";
import type { Watched } from "./types";

/** Marks a movie or an episode watched; the page comes back with the new state. */
export function WatchedToggle({ watched, large }: { watched: Watched; large?: boolean }) {
  const { t, path } = useI18n();
  const { submit, busy } = useNavigation();
  const url = path(watched.watched ? watched.unmarkUrl : watched.markUrl);
  return (
    <button
      type="button"
      className={`${large ? "button large" : "icon-button"} watched-toggle${watched.watched ? " on" : ""}`}
      aria-pressed={watched.watched}
      title={t(watched.watched ? "library.unmarkWatched" : "library.markWatched")}
      disabled={busy}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void submit(url, formData({}), { scroll: false });
      }}
    >
      <Icon name={watched.watched ? "check" : "eye"} size={large ? 18 : 17} />
      {large && <span>{t(watched.watched ? "library.watched" : "library.markWatched")}</span>}
    </button>
  );
}
