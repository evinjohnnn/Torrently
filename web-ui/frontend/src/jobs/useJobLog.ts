import { useEffect, useReducer } from "react";

/** One message of a job log (services/job LogItem). */
export interface LogItem {
  level:
    | "open"
    | "inprogress"
    | "statusupdate"
    | "done"
    | "skip"
    | "info"
    | "warn"
    | "error"
    | "redirect"
    | "download"
    | "rendertemplate"
    | "custom"
    | "close"
    | "clear";
  message?: string;
  status?: string;
  tag?: string;
  location?: string;
  template?: string;
  body?: string;
  data?: unknown;
}

export interface Step {
  tag: string;
  message: string;
  /** inprogress, done, skip, warn or error */
  level: string;
  /** a countdown or percentage while the step runs */
  status?: string;
}

export interface JobState {
  steps: Step[];
  /** things to read while it works ("still waiting, you can close this page") */
  notes: string[];
  error?: string;
  warning?: string;
  /** the job's answer, when it has one */
  result?: LogItem;
  closed: boolean;
}

const initial: JobState = { steps: [], notes: [], closed: false };

function reduce(state: JobState, item: LogItem): JobState {
  const tag = item.tag ?? item.message ?? "";
  const update = (level: string) =>
    state.steps.map((step) =>
      step.tag === tag ? { ...step, level, status: item.status ?? step.status } : step,
    );
  switch (item.level) {
    case "clear":
      return initial;
    case "inprogress":
      if (state.steps.some((step) => step.tag === tag)) return state;
      return {
        ...state,
        steps: [...state.steps, { tag, message: item.message ?? "", level: "inprogress" }],
      };
    case "statusupdate":
      return { ...state, steps: update("inprogress") };
    case "done":
    case "skip":
      return { ...state, steps: update(item.level) };
    case "warn":
      return { ...state, steps: update("warn"), warning: item.message };
    case "error":
      return { ...state, steps: update("error"), error: item.message || state.error };
    case "info":
      if (!item.message || state.notes.includes(item.message)) return state;
      return { ...state, notes: [...state.notes, item.message] };
    case "redirect":
    case "download":
    case "rendertemplate":
    case "custom":
      return { ...state, result: item };
    case "close":
      return { ...state, closed: true };
    default:
      return state;
  }
}

/**
 * Follows a job's log (GET /queue/<queue>/job/<id>/log, server-sent events).
 * The server replays what already happened, so opening it late is fine.
 */
export function useJobLog(url: string | null | undefined) {
  const [state, dispatch] = useReducer(reduce, initial);
  useEffect(() => {
    if (!url) return;
    dispatch({ level: "clear" });
    const source = new EventSource(url, { withCredentials: true });
    source.addEventListener("message", (event) => {
      try {
        const item = JSON.parse((event as MessageEvent).data) as LogItem;
        dispatch(item);
        if (item.level === "close") source.close();
      } catch {
        /* a malformed line is skipped, like the old log did */
      }
    });
    source.addEventListener("error", () => {
      // the server closes the stream when the job ends; anything else is a
      // dropped connection the browser retries on its own
      if (source.readyState === EventSource.CLOSED) dispatch({ level: "close" });
    });
    return () => source.close();
  }, [url]);
  return state;
}
