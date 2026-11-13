import type { ReactNode } from "react";
import { Icon, type IconName } from "../../ui/Icon";

/** What a list says when it has nothing in it yet. */
export function Empty({ icon, title, children }: { icon: IconName; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <span className="empty-mark" aria-hidden="true">
        <Icon name={icon} size={26} />
      </span>
      <h2>{title}</h2>
      {children}
    </div>
  );
}

/** The page's error, from a mutation that came back with ?status=error. */
export function PageError({ text }: { text: string }) {
  return (
    <div className="notice error" role="alert">
      <Icon name="alert" />
      <span>{text}</span>
    </div>
  );
}
