import { useCallback, useRef, useState } from "react";
import { postForm, type Fields } from "../app/api";
import { useSession } from "../app/router";
import { useI18n } from "../i18n";
import { turnstileToken } from "./turnstile";

interface Job {
  logUrl?: string;
}

export interface Run {
  /** a new run each time, so the same action can be started again */
  key: number;
  logUrl?: string;
  error?: string;
}

/**
 * Starts a file action (POST /stream-video, /download-file, …) and keeps the
 * run it started. `challenge` is where a Turnstile widget may appear.
 */
export function useAction() {
  const session = useSession();
  const { t, path } = useI18n();
  const [run, setRun] = useState<Run | null>(null);
  const [starting, setStarting] = useState(false);
  const challenge = useRef<HTMLDivElement>(null);
  const counter = useRef(0);

  const start = useCallback(
    async (endpoint: string, fields: Fields) => {
      const key = ++counter.current;
      setStarting(true);
      try {
        const extra: Fields = {};
        if (session.turnstile && challenge.current) {
          extra["cf-turnstile-response"] = await turnstileToken(session.turnstile, challenge.current);
        }
        const answer = await postForm<Job>(path(endpoint), { ...fields, ...extra }, session);
        if (key !== counter.current) return;
        setRun({
          key,
          logUrl: answer.data?.logUrl,
          error: answer.error ? t(answer.error.key) : answer.data?.logUrl ? undefined : t("error.generic"),
        });
      } catch {
        if (key === counter.current) setRun({ key, error: t("error.generic") });
      } finally {
        if (key === counter.current) setStarting(false);
      }
    },
    [session, path, t],
  );

  const clear = useCallback(() => {
    counter.current++;
    setRun(null);
    setStarting(false);
  }, []);

  return { run, starting, start, clear, challenge };
}
