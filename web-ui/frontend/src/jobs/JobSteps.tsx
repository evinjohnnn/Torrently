import type { JobState } from "./useJobLog";
import { Icon } from "../ui/Icon";

/** The job's steps as they happen: a spinner while running, a tick when done. */
export function JobSteps({ job }: { job: JobState }) {
  if (!job.steps.length && !job.notes.length) {
    if (job.closed) return null;
    return (
      <div className="job-steps">
        <div className="job-step running">
          <span className="spinner" aria-hidden="true" />
        </div>
      </div>
    );
  }
  return (
    <div className="job-steps" aria-live="polite">
      {job.steps.map((step) => (
        <div key={step.tag} className={`job-step ${step.level}`}>
          <span className="job-mark" aria-hidden="true">
            {step.level === "inprogress" ? (
              <span className="spinner" />
            ) : step.level === "error" ? (
              <Icon name="close" size={16} />
            ) : step.level === "warn" ? (
              <Icon name="alert" size={16} />
            ) : (
              <Icon name="check" size={16} />
            )}
          </span>
          <span className="job-text">{step.message}</span>
          {step.status && step.level === "inprogress" && (
            <span className="job-status mono">{step.status}</span>
          )}
        </div>
      ))}
      {job.notes.map((note) => (
        <p key={note} className="job-note">
          {note}
        </p>
      ))}
    </div>
  );
}
