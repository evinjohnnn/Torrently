import { useCallback, useEffect, useRef, useState } from "react";
import { formData } from "../../app/api";
import { useNavigation, usePage } from "../../app/router";
import { useI18n } from "../../i18n";
import { Icon } from "../../ui/Icon";
import { PageHead, Sheet } from "../content/kit";
import { measure } from "./measure";
import "./speedtest.css";

export const namespaces = ["speedtest"];

interface SpeedtestData {
  urls: { url: string; type: string }[];
  autoStart: boolean;
}

type Run =
  | { stage: "idle" }
  | { stage: "running"; premium: boolean; status: string; speed: number; percent: number }
  | { stage: "failed" };

export default function Speedtest() {
  const { t, path } = useI18n();
  const { data } = usePage<SpeedtestData>();
  const { submit } = useNavigation();
  const [run, setRun] = useState<Run>({ stage: "idle" });
  const abort = useRef<AbortController | null>(null);

  useEffect(() => () => abort.current?.abort(), []);

  const start = useCallback(async () => {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setRun({ stage: "running", premium: false, status: t("speedtest.gettingServer"), speed: 0, percent: 0 });
    try {
      if (data.urls.length === 0) throw new Error("no speedtest servers");
      let standard = 0;
      let premium = 0;
      for (const entry of data.urls) {
        const isPremium = entry.type === "premium";
        const status = t(isPremium ? "speedtest.testingPremium" : "speedtest.measuring");
        setRun({ stage: "running", premium: isPremium, status, speed: 0, percent: 0 });
        const speed = await measure(
          entry.url,
          (p) => !controller.signal.aborted && setRun({ stage: "running", premium: isPremium, status, ...p }),
          controller.signal,
        );
        if (isPremium) premium = speed;
        else standard = speed;
      }
      const fields: Record<string, string> = {
        speed: standard.toFixed(1),
        "premium-speed": premium.toFixed(1),
      };
      for (const entry of data.urls) fields[`${entry.type}-url`] = entry.url;
      await submit(path("/speedtest"), formData(fields), { scroll: true });
    } catch {
      if (controller.signal.aborted) return;
      setRun({ stage: "failed" });
      // the classic page showed the error for 3 s, then the button again
      setTimeout(() => !controller.signal.aborted && setRun({ stage: "idle" }), 3000);
    }
  }, [data.urls, path, submit, t]);

  // "Run again" lands here with ?again: measure straight away
  const autoStarted = useRef(false);
  useEffect(() => {
    if (data.autoStart && !autoStarted.current) {
      autoStarted.current = true;
      void start();
    }
  }, [data.autoStart, start]);

  return (
    <>
      <PageHead title={t("speedtest.title")} lede={t("speedtest.subtitle")} />
      <Sheet>
        <div className="speed-pane glass">
          {run.stage === "idle" ? (
            <button type="button" className="button primary large speed-start" onClick={() => void start()} data-umami-event="speedtest-start">
              <Icon name="play" size={18} />
              {t("speedtest.start")}
            </button>
          ) : (
            <div className="speed-meter" aria-live="polite">
              <p className={run.stage === "running" && run.premium ? "speed-phase premium" : "speed-phase"}>
                {run.stage === "running" ? t(run.premium ? "speedtest.premiumServer" : "speedtest.standardServer") : " "}
              </p>
              <p className="speed-figure">
                <span className="mono">{run.stage === "running" ? run.speed.toFixed(1) : "0.0"}</span>
                <span className="speed-unit">Mbps</span>
              </p>
              <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={run.stage === "running" ? run.percent : 0}>
                <span style={{ width: `${run.stage === "running" ? run.percent : 0}%` }} />
              </div>
              <p className={run.stage === "failed" ? "speed-status failed" : "speed-status"}>
                {run.stage === "running" ? run.status : t("error.generic")}
              </p>
            </div>
          )}
        </div>
      </Sheet>
    </>
  );
}
