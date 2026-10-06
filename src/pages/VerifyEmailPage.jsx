import { useCallback, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { AlertCircle, CheckCircle2, Loader2, MailCheck } from "lucide-react";
import { useAppAuth } from "../context/auth";
import { useI18n } from "../i18n";
import { MotionLeaf } from "../components/MotionLeaf";

/* ── /verify-email ──────────────────────────────────────────────────────────
   Where the emailed link lands. The account is created by the button press, not
   by loading this page: mail clients and corporate link scanners prefetch URLs,
   and a GET that completed the verification would burn the single-use token
   before the person ever saw it. That is also why /api/verifyEmail refuses GET
   outright.

   States: idle → working → success | expired | invalid | already. Each failure
   offers a way forward rather than a dead end, since the overwhelmingly common
   cause is simply clicking tomorrow's link. */
export default function VerifyEmailPage() {
  const { t } = useI18n();
  const { completeEmailVerification } = useAppAuth();
  const [params] = useSearchParams();
  const token = params.get("token") || "";

  const [status, setStatus] = useState("idle"); // idle | working | success | error
  const [failure, setFailure] = useState("");
  const startedRef = useRef(false);
  // Built once, above the status branches below: both returns draw the same
  // leaf instead of constructing it (and calling hooks) inline.
  const L = new MotionLeaf();

  // Only ever called from the button below. Nothing in this component verifies on
  // mount: a mail client or corporate scanner that executes page JS would
  // otherwise spend the single-use token and leave the real recipient holding a
  // dead link.
  const verify = useCallback(async () => {
    if (startedRef.current) return;
    if (!token) {
      setStatus("error");
      setFailure("missingToken");
      return;
    }
    startedRef.current = true;
    setStatus("working");
    const result = await completeEmailVerification(token);
    if (result.success) {
      setStatus("success");
      return;
    }
    setStatus("error");
    // 410 from the server is specifically "expired"; anything else that already
    // exists is "sign in instead".
    if (result.status === 410) setFailure("expired");
    else if (result.status === 409) setFailure("already");
    else setFailure("invalid");
  }, [token, completeEmailVerification]);

  const titleKey = {
    working: "authEmail.verifyWorking",
    success: "authEmail.verifySuccessTitle",
  }[status] || (failure === "expired" ? "authEmail.verifyExpiredTitle" : failure === "already" ? "authEmail.verifyAlreadyTitle" : failure === "missingToken" ? "authEmail.verifyNoTokenTitle" : "authEmail.verifyInvalidTitle");

  const bodyKey = {
    success: "authEmail.verifySuccessBody",
    expired: "authEmail.verifyExpiredBody",
    already: "authEmail.verifyAlreadyBody",
    invalid: "authEmail.verifyInvalidBody",
    missingToken: "authEmail.verifyNoTokenBody",
  }[status === "success" ? "success" : failure] || "authEmail.verifyInvalidBody";

  if (status === "idle") {
    return (
      <main className="verify-page">
        <motion.section
          className="verify-card"
          initial={L.Modal.panel.initial}
          animate={L.Modal.panel.animate}
          transition={L.Modal.panel.transition}
        >
          <MailCheck size={30} className="verify-card__icon" aria-hidden="true" />
          <h1 className="verify-card__title">
            {t(token ? "authEmail.verifyConfirmTitle" : "authEmail.verifyNoTokenTitle")}
          </h1>
          <p className="verify-card__body">
            {t(token ? "authEmail.verifyConfirmBody" : "authEmail.verifyNoTokenBody")}
          </p>
          <div className="verify-card__actions">
            {token ? (
              <button type="button" className="verify-card__action" onClick={verify}>
                {t("authEmail.verifyConfirmButton")}
              </button>
            ) : (
              // Opened by hand (no token) rather than from an email: the only
              // way forward is to sign up again for a real link.
              <Link className="verify-card__action" to="/settings">
                {t("authEmail.verifyGoToSignIn")}
              </Link>
            )}
          </div>
        </motion.section>
      </main>
    );
  }

  return (
    <main className="verify-page">
      <motion.section
        className="verify-card"
        role="status"
        aria-live="polite"
        initial={L.Modal.panel.initial}
        animate={L.Modal.panel.animate}
        transition={L.Modal.panel.transition}
      >
        {status === "working" && (
          <>
            <Loader2 size={30} className="verify-card__icon" aria-hidden="true" />
            <h1 className="verify-card__title">{t(titleKey)}</h1>
          </>
        )}

        {status === "success" && (
          <>
            <CheckCircle2 size={30} className="verify-card__icon" aria-hidden="true" />
            <h1 className="verify-card__title">{t(titleKey)}</h1>
            <p className="verify-card__body">{t(bodyKey)}</p>
            <div className="verify-card__actions">
              <Link className="verify-card__action" to="/">
                {t("common.done")}
              </Link>
            </div>
          </>
        )}

        {status === "error" && (
          <>
            <AlertCircle size={30} className="verify-card__icon verify-card__icon--bad" aria-hidden="true" />
            <h1 className="verify-card__title">{t(titleKey)}</h1>
            <p className="verify-card__body">{t(bodyKey)}</p>
            <div className="verify-card__actions">
              <Link className="verify-card__action" to="/settings">
                {t("authEmail.verifyGoToSignIn")}
              </Link>
              {/* Nothing was ever written for a link that did not verify, so
                  "sign up again" is a clean start — there is no half-account to
                  clean up and no need to explain a resend button here. */}
              <Link className="verify-card__action verify-card__action--ghost" to="/">
                {t("common.back")}
              </Link>
            </div>
          </>
        )}
      </motion.section>
    </main>
  );
}
