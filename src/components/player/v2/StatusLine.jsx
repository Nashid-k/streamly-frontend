import { STATUS_KIND } from "./statusMachine";

/**
 * The status line (task.md 2.9).
 *
 * This is where the messages the old player threw away are supposed to land. The
 * rule it enforces: a status is for something the VIEWER can see or act on.
 * Engineering telemetry does not belong here — "buffer holds ~120MB ahead" is
 * real information, but it is for the console, not for someone's evening.
 *
 * `role="alert"` is reserved for errors. Everything else is `role="status"`,
 * because a "trying the next source" notice should not interrupt a screen-reader
 * user mid-sentence, and it must not steal focus either — this line never takes
 * focus automatically.
 */
export default function StatusLine({
  message,
  kind = STATUS_KIND.INFO,
  live = "polite",
  onDismiss,
  reduceMotion = false,
}) {
  if (!message) return null;

  return (
    <div
      className="pv2-status pv2-glass"
      data-kind={kind}
      data-reduce-motion={reduceMotion ? "true" : "false"}
      role={kind === STATUS_KIND.ERROR ? "alert" : "status"}
      aria-live={live}
    >
      <span className="pv2-status__text">{message}</span>
      {onDismiss && (
        <button
          type="button"
          className="pv2-status__dismiss"
          onClick={onDismiss}
          aria-label="Dismiss"
        >
          <span aria-hidden="true">&times;</span>
        </button>
      )}
    </div>
  );
}
