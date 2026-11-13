import { useEffect, useState } from "react";
import { useNavigation } from "../app/router";
import { Icon } from "../ui/Icon";

interface Toast {
  id: number;
  text: string;
  tone: "success" | "error";
}

const EVENT = "torrently:toast";
let next = 0;

/** Shows a short confirmation at the bottom of the screen. */
export function toast(text: string, tone: Toast["tone"] = "success") {
  dispatchEvent(new CustomEvent(EVENT, { detail: { text, tone } }));
}

/**
 * Toasts come from two places: code that calls toast(), and the
 * ?status=success&message= a mutation redirects back with (the message is
 * already translated by the server). The query is taken off the address.
 */
export function Toasts() {
  const { state } = useNavigation();
  const [items, setItems] = useState<Toast[]>([]);

  useEffect(() => {
    const add = (event: Event) => {
      const { text, tone } = (event as CustomEvent).detail;
      const id = ++next;
      setItems((list) => [...list, { id, text, tone }]);
      setTimeout(() => setItems((list) => list.filter((item) => item.id !== id)), 4000);
    };
    addEventListener(EVENT, add);
    return () => removeEventListener(EVENT, add);
  }, []);

  useEffect(() => {
    const url = new URL(location.href);
    const status = url.searchParams.get("status");
    if (status !== "success") return;
    const message = url.searchParams.get("message");
    if (message) toast(message);
    for (const name of ["status", "message", "from"]) url.searchParams.delete(name);
    history.replaceState(history.state, "", url);
  }, [state]);

  return (
    <div className="toasts" role="status" aria-live="polite">
      {items.map((item) => (
        <div key={item.id} className={`toast glass ${item.tone}`}>
          <Icon name={item.tone === "error" ? "alert" : "check"} size={18} />
          <span>{item.text}</span>
        </div>
      ))}
    </div>
  );
}
