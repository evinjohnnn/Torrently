import type { ReactNode } from "react";
import { Icon } from "../../ui/Icon";

export interface Line {
  level: "inprogress" | "done" | "error";
  message: string;
}

/** The narrow pane every sign-in page sits in. */
export function Frame({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="wrap auth-page">
      <section className="auth-pane glass">
        <header>
          <h1>{title}</h1>
          {subtitle && <p className="lede">{subtitle}</p>}
        </header>
        {children}
      </section>
    </div>
  );
}

/** What an auth call is doing: one line, a spinner then a tick or a cross. */
export function Progress({ line }: { line: Line | null }) {
  if (!line) return null;
  return (
    <div className={`auth-progress ${line.level}`} role="status" aria-live="polite">
      <span className="job-mark" aria-hidden="true">
        {line.level === "inprogress" ? (
          <span className="spinner" />
        ) : (
          <Icon name={line.level === "done" ? "check" : "close"} size={16} />
        )}
      </span>
      <span>{line.message}</span>
    </div>
  );
}

/** auth.progress.* strings carry one Go-printf style %v. */
export const fill = (text: string, value?: string | number) =>
  value === undefined ? text : text.replace("%v", String(value));
