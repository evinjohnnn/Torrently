import { useEffect, useState } from "react";
import { formData } from "../../app/api";
import { useNavigation } from "../../app/router";
import { useI18n } from "../../i18n";
import { Dialog } from "../../ui/Dialog";
import { Icon } from "../../ui/Icon";

// web.MaxBulkIDs: the server refuses more, so Select all stops here.
const MAX = 1000;

export interface Bulk {
  on: boolean;
  picked: Set<string>;
  setOn(on: boolean): void;
  toggle(id: string): void;
  all(): void;
}

/**
 * "Remove selected" on a list page (the library, Vault). `ids` are the rows
 * that can go; a row that leaves the list (a new section, a removal) leaves
 * the selection too.
 */
export function useBulk(ids: string[]): Bulk {
  const [on, setMode] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const key = ids.join(",");
  useEffect(() => {
    setPicked((prev) => new Set([...prev].filter((id) => ids.includes(id))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return {
    on,
    picked,
    setOn(next) {
      setMode(next);
      if (!next) setPicked(new Set());
    },
    toggle(id) {
      const next = new Set(picked);
      if (next.has(id)) next.delete(id);
      else if (next.size < MAX) next.add(id);
      setPicked(next);
    },
    all() {
      setPicked(new Set(ids.slice(0, MAX)));
    },
  };
}

/** The bar's buttons: Select, then Select all, Remove (n) and Cancel. */
export function BulkBar({ bulk, endpoint, confirm }: { bulk: Bulk; endpoint: string; confirm: string }) {
  const { t, path } = useI18n();
  const { submit, busy } = useNavigation();
  const [asking, setAsking] = useState(false);
  if (!bulk.on) {
    return (
      <button type="button" className="button" onClick={() => bulk.setOn(true)}>
        {t("bulk.select")}
      </button>
    );
  }
  const remove = async () => {
    const ids = [...bulk.picked];
    setAsking(false);
    // one comma-joined field: a multipart part per id is cut off at 1000
    await submit(path(endpoint), formData({ resource_ids: ids.join(",") }), { scroll: false });
    bulk.setOn(false);
    const umami = (window as { umami?: { track(name: string, data: object): void } }).umami;
    umami?.track("bulk-remove", { path: endpoint, count: ids.length });
  };
  return (
    <>
      <button type="button" className="button quiet" onClick={bulk.all}>
        {t("bulk.selectAll")}
      </button>
      <button
        type="button"
        className="button danger"
        disabled={!bulk.picked.size || busy}
        onClick={() => setAsking(true)}
      >
        <Icon name="trash" size={17} />
        {t("bulk.remove")}
        {bulk.picked.size > 0 && <span className="mono">{bulk.picked.size}</span>}
      </button>
      <button type="button" className="button quiet" onClick={() => bulk.setOn(false)}>
        {t("bulk.cancel")}
      </button>
      <Dialog open={asking} onClose={() => setAsking(false)} title={t("bulk.remove")}>
        <p>{confirm}</p>
        <div className="dialog-actions">
          <button type="button" className="button quiet" onClick={() => setAsking(false)}>
            {t("bulk.cancel")}
          </button>
          <button type="button" className="button danger" onClick={() => void remove()}>
            <Icon name="trash" size={17} />
            {t("bulk.remove")} <span className="mono">{bulk.picked.size}</span>
          </button>
        </div>
      </Dialog>
    </>
  );
}

/** A row's box in select mode; the row around it is its label. */
export function BulkBox({ bulk, id, label, disabled, title }: { bulk: Bulk; id: string; label: string; disabled?: boolean; title?: string }) {
  return (
    <span className="row-pick" title={title}>
      <input
        type="checkbox"
        aria-label={label}
        checked={bulk.picked.has(id)}
        disabled={disabled}
        onChange={() => bulk.toggle(id)}
      />
    </span>
  );
}
