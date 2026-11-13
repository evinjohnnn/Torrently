import { useEffect, useRef, type ReactNode } from "react";
import { useI18n } from "../i18n";
import { Icon } from "./Icon";

/** A modal on the native <dialog>: focus, Escape and the backdrop for free. */
export function Dialog({
  open,
  onClose,
  title,
  subtitle,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const { t } = useI18n();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className="dialog glass"
      onClose={onClose}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
    >
      <header className="dialog-head">
        <div>
          <h2>{title}</h2>
          {subtitle && <p className="dialog-sub">{subtitle}</p>}
        </div>
        <button type="button" className="icon-button" aria-label={t("resource.close")} onClick={onClose}>
          <Icon name="close" />
        </button>
      </header>
      {open && <div className="dialog-body">{children}</div>}
    </dialog>
  );
}
