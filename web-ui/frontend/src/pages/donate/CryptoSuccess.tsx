import { useEffect } from "react";
import { Link, useNavigation, usePage } from "../../app/router";
import { JobSteps } from "../../jobs/JobSteps";
import { useJobLog } from "../../jobs/useJobLog";
import { useI18n } from "../../i18n";
import { ErrorNotice, PageHead, Sheet } from "../content/kit";
import "./donate.css";

export const namespaces = ["donate", "job"];

interface SuccessData {
  state: "" | "done" | "pending" | "partial" | "failed";
  invoiceUrl?: string;
  jobLogUrl?: string;
}

/**
 * While the payment is pending a job watches it and redirects back here
 * once it settles; without a job the page re-reads itself, as the copy
 * promises ("This page refreshes automatically").
 */
function Pending() {
  const { t } = useI18n();
  const { data } = usePage<SuccessData>();
  const { navigate, refresh } = useNavigation();
  const job = useJobLog(data.jobLogUrl);

  useEffect(() => {
    const result = job.result;
    if (result?.level !== "redirect" || !result.location) return;
    const target = new URL(result.location, location.href);
    void navigate(target.pathname + target.search, { replace: true });
  }, [job.result, navigate]);

  useEffect(() => {
    if (data.jobLogUrl) return;
    const timer = window.setInterval(() => void refresh(), 15000);
    return () => window.clearInterval(timer);
  }, [data.jobLogUrl, refresh]);

  return (
    <div className="payment-pane glass">
      {data.jobLogUrl ? (
        <JobSteps job={job} />
      ) : (
        <div className="job-step">
          <span className="job-mark" aria-hidden="true">
            <span className="spinner" />
          </span>
        </div>
      )}
      {job.error && <ErrorNotice>{job.error}</ErrorNotice>}
      <p className="payment-note">{t("donate.crypto.success.pending")}</p>
      {data.invoiceUrl && (
        <a className="button" href={data.invoiceUrl} data-umami-event="donate-pending-invoice">
          {t("donate.crypto.success.backToInvoice")}
        </a>
      )}
    </div>
  );
}

export default function CryptoSuccess() {
  const { t, path } = useI18n();
  const { data, error } = usePage<SuccessData>();
  if (error) {
    return (
      <>
        <PageHead title={t("donate.crypto.success.title")} />
        <Sheet>
          <ErrorNotice>{t(error.key)}</ErrorNotice>
        </Sheet>
      </>
    );
  }
  switch (data.state) {
    case "done":
      return (
        <>
          <PageHead title={t("donate.crypto.success.doneTitle")} lede={t("donate.crypto.success.done")}>
            <div className="page-actions">
            <Link className="button primary large" href={path("/profile")} data-umami-event="donate-success-profile">
              {t("donate.crypto.success.toProfile")}
            </Link>
            </div>
          </PageHead>
        </>
      );
    case "pending":
      return (
        <>
          <PageHead title={t("donate.crypto.success.pendingTitle")} />
          <Sheet>
            <Pending />
          </Sheet>
        </>
      );
    case "partial":
      return (
        <>
          <PageHead title={t("donate.crypto.success.partialTitle")} lede={t("donate.crypto.success.partial")}>
            <div className="page-actions">
            <Link className="button primary large" href={path("/support")} data-umami-event="donate-partial-support">
              {t("donate.crypto.success.toSupport")}
            </Link>
            </div>
          </PageHead>
        </>
      );
    default:
      return (
        <>
          <PageHead title={t("donate.crypto.success.failedTitle")} lede={t("donate.crypto.success.failed")}>
            <div className="page-actions">
            <Link className="button primary large" href={path("/donate")} data-umami-event="donate-failed-retry">
              {t("donate.crypto.success.retry")}
            </Link>
            </div>
          </PageHead>
        </>
      );
  }
}
