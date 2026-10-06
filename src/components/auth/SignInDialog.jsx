import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { Eye, EyeOff, Mail, X } from "lucide-react";
import { MotionFade, MotionLeaf } from "../../components/MotionLeaf";
import { useAppAuth } from "../../context/auth";
import { useI18n } from "../../i18n";
import { logWarn } from "../../utils/debugLogger";

/* ── Sign in / create account ───────────────────────────────────────────────
   One dialog for both, mounted once by <AuthProvider>. Anything that requires an
   account calls `requireAuth()` from useAppAuth(), which opens this — so the
   prompt appears from a rail card, a history row or a collection menu without
   each of those knowing how sign-in works.

   Sign-up is three-step from the user's side but one form here: submit → "check
   your inbox". Nothing is signed in yet, because /api/register deliberately
   creates nothing until the link is opened (server/verifyToken.js). Saying so on
   screen is the whole point — a user who closes the tab here has NOT signed up. */

const MIN_PASSWORD_LENGTH = 10;
// Mirrors server/passwords.js loosely: the server is the authority, this only
// avoids a pointless round-trip for obviously-invalid input.
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * A fresh form is a constant, and the whole "re-seed on every open" effect is
 * avoided entirely by giving <SignInDialog> a changing `key`: React unmounts it
 * on close and mounts it anew on open, so nothing survives — no password in a
 * stale closure, no leftover server error text.
 */
function SignInDialog({ initialMode = "signin", reason = "", onClose }) {
  const { t } = useI18n();
  const { loginWithEmail, registerAccount, user } = useAppAuth();

  const [mode, setMode] = useState(initialMode);
  const [form, setForm] = useState(() => ({ name: "", email: "", password: "" }));
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // Set only after a successful /api/register — the "check your inbox" panel.
  const [pendingEmail, setPendingEmail] = useState("");
  const emailRef = useRef(null);
  const panelRef = useRef(null);
  // Read by the keydown handler, which must not re-subscribe every time `busy`
  // flips — re-running the effect mid-typing would steal focus back to the
  // email field on each keystroke.
  const busyRef = useRef(false);
  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);
  const openerRef = useRef(null);
  const overflowRef = useRef(null);

  /* Modal hygiene, moved here from the copy of this panel that used to live in
     SettingsPage: lock body scroll, move focus into the panel, trap Tab inside
     it, allow Escape to dismiss, and hand focus back to whatever opened it. A
      dialog that can be summoned from a card click and dismissed by clicking
      the page behind it has to own all of that itself — callers cannot. */

  /**
   * Dismiss, handing focus straight back to whatever opened the dialog.
   *
   * Done here rather than in the unmount cleanup because <AnimatePresence> keeps
   * this component mounted for the length of the exit fade. Waiting for unmount
   * meant focus sat inside a dialog that was already invisible — long enough for
   * the next Tab to land nowhere useful.
   */
  const requestClose = useCallback(() => {
    const opener = openerRef.current;
    if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    // Released here, not in the unmount cleanup: <AnimatePresence> keeps this
    // mounted for the exit fade, and a page that stays scroll-locked behind a
    // dialog the user has already dismissed feels broken.
    if (overflowRef.current !== null) {
      document.body.style.overflow = overflowRef.current;
      overflowRef.current = null;
    }
    onClose?.();
  }, [onClose]);

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    // Captured on mount — and this dialog is mounted fresh on every open, so
    // "active element right now" is the control that summoned it.
    openerRef.current = document.activeElement;
    overflowRef.current = prevOverflow;
    document.body.style.overflow = "hidden";

    const focusables = () => {
      const panel = panelRef.current;
      if (!panel) return [];
      return [
        ...panel.querySelectorAll(
          "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])",
        ),
      ].filter((el) => !el.disabled && !el.hidden);
    };

    // Land on the email field when it is the first thing on screen, otherwise on
    // whatever comes first — a focus trap that opens on the close button reads
    // as "dismiss this" to anyone arriving by keyboard.
    //
    // Synchronous, not on a rAF: this effect already runs after the panel is
    // committed to the DOM, so there is nothing to wait for, and deferring it
    // leaves focus on the page behind for a frame.
    (emailRef.current || focusables()[0] || panelRef.current)?.focus?.();

    const handleKey = (e) => {
      // Escape must not abandon an in-flight request: the dialog would close
      // while /api/login is still running, and its result would then adopt a
      // session behind a dialog the user no longer sees.
      if (e.key === "Escape") {
        if (!busyRef.current) requestClose();
        return;
      }
      if (e.key !== "Tab") return;
      const panel = panelRef.current;
      const items = focusables();
      if (!panel || items.length === 0) {
        e.preventDefault();
        panel?.focus?.();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (!panel.contains(document.activeElement)) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => {
      // Safety net for a close that never went through requestClose (a sign-in
      // landing from another tab unmounts us directly). Idempotent: requestClose
      // already nulled the ref.
      if (overflowRef.current !== null) {
        document.body.style.overflow = overflowRef.current;
        overflowRef.current = null;
      }
      document.removeEventListener("keydown", handleKey);
    };
  }, [requestClose]);

  // Signing in by any other means (the /verify-email route, another tab) while
  // this is open should dismiss it — there is nothing left to do.
  useEffect(() => {
    if (user) requestClose();
  }, [user, requestClose]);

  const setField = useCallback((field) => (e) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
    setError("");
  }, []);

  const switchMode = useCallback((next) => {
    setMode(next);
    setError("");
    setPendingEmail("");
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    if (busy) return;

    const email = form.email.trim();
    if (!EMAIL_SHAPE.test(email)) {
      setError(t("authEmail.invalidEmail"));
      return;
    }
    if (form.password.length < MIN_PASSWORD_LENGTH) {
      setError(t("authEmail.weakPassword", { min: MIN_PASSWORD_LENGTH }));
      return;
    }
    if (mode === "signup" && !form.name.trim()) {
      setError(t("authEmail.nameRequired"));
      return;
    }

    setBusy(true);
    setError("");
    try {
      if (mode === "signup") {
        const result = await registerAccount({
          name: form.name.trim(),
          email,
          password: form.password,
        });
        if (result.success) {
          setPendingEmail(result.email || email);
          return;
        }
        setError(result.message || t("authEmail.genericError"));
        return;
      }

      const result = await loginWithEmail({ email, password: form.password });
      if (result.success) {
        requestClose();
        return;
      }
      // A wrong password is the overwhelmingly common case here; say so
      // instead of leaving the user wondering which field was wrong.
      setError(result.message || t("authEmail.genericError"));
    } catch (err) {
      logWarn("auth", "Sign-in dialog submit threw.", { message: err?.message });
      setError(t("authEmail.genericError"));
    } finally {
      setBusy(false);
    }
  }

  const heading = mode === "signup" ? t("authEmail.createTitle") : t("authEmail.signInTitle");

  const L = new MotionLeaf();
  // Portaled to <body>: every page is wrapped in a motion.div that carries a
  // transform, which would break `position: fixed` on the backdrop.
  return createPortal(
    <MotionFade
      className="auth-dialog-backdrop"
      role="presentation"
      onMouseDown={(e) => {
            // onMouseDown, not onClick: a drag that starts inside the panel and
            // ends on the backdrop must not dismiss the dialog, and that can
            // never be undone once the click has fired.
            if (e.target === e.currentTarget && !busy) requestClose();
          }}
    >
          <motion.div
            ref={panelRef}
            className="auth-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={heading}
            tabIndex={-1}
            initial={L.Modal.panel.initial}
            animate={L.Modal.panel.animate}
            exit={L.Modal.panelExit}
            transition={L.Modal.panel.transition}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="auth-dialog__header">
              <h2 className="auth-dialog__title">{heading}</h2>
              <button
                type="button"
                className="auth-dialog__close"
                aria-label={t("common.close")}
                onClick={requestClose}
                disabled={busy}
              >
                <X size={18} />
              </button>
            </div>

            {pendingEmail ? (
              <div className="auth-dialog__pending">
                <Mail size={28} className="auth-dialog__pending-icon" aria-hidden="true" />
                <p className="auth-dialog__pending-title">{t("authEmail.checkInboxTitle")}</p>
                <p className="auth-dialog__pending-body">
                  {t("authEmail.checkInboxBody", { email: pendingEmail })}
                </p>
                <p className="auth-dialog__pending-note">{t("authEmail.checkInboxNote")}</p>
                <button
                  type="button"
                  className="auth-dialog__ghost"
                  onClick={() => switchMode("signin")}
                >
                  {t("authEmail.backToSignIn")}
                </button>
              </div>
            ) : (
              <>
                <div className="auth-dialog__tabs" role="tablist" aria-label={heading}>
                  <button
                    type="button"
                    role="tab"
                    className="auth-dialog__tab"
                    aria-selected={mode === "signin"}
                    onClick={() => switchMode("signin")}
                  >
                    {t("authEmail.signInTab")}
                  </button>
                  <button
                    type="button"
                    role="tab"
                    className="auth-dialog__tab"
                    aria-selected={mode === "signup"}
                    onClick={() => switchMode("signup")}
                  >
                    {t("authEmail.createTab")}
                  </button>
                </div>

            <p className="auth-dialog__blurb">
              {/* A gate-supplied reason outranks the generic pitch: the user was
                  refused something specific a moment ago and deserves to be told
                  why that happened. */}
              {reason ? t(`authEmail.${reason}`) : mode === "signup" ? t("authEmail.signupBlurb") : t("authEmail.signInBlurb")}
            </p>

                <form className="auth-dialog__form" onSubmit={handleSubmit} noValidate>
                  {mode === "signup" && (
                    <label className="auth-dialog__field">
                      <span className="auth-dialog__label">{t("authEmail.name")}</span>
                      <input
                        className="auth-dialog__input"
                        type="text"
                        autoComplete="name"
                        maxLength={80}
                        value={form.name}
                        onChange={setField("name")}
                        placeholder={t("authEmail.namePlaceholder")}
                      />
                    </label>
                  )}

                  <label className="auth-dialog__field">
                    <span className="auth-dialog__label">{t("authEmail.email")}</span>
                    <input
                      ref={emailRef}
                      className="auth-dialog__input"
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      value={form.email}
                      onChange={setField("email")}
                      placeholder="you@example.com"
                    />
                  </label>

                  <label className="auth-dialog__field">
                    <span className="auth-dialog__label">{t("authEmail.password")}</span>
                    <span className="auth-dialog__input-wrap">
                      <input
                        className="auth-dialog__input auth-dialog__input--bare"
                        type={showPassword ? "text" : "password"}
                        autoComplete={mode === "signup" ? "new-password" : "current-password"}
                        value={form.password}
                        onChange={setField("password")}
                        placeholder={mode === "signup" ? t("authEmail.passwordPlaceholderSignup") : ""}
                      />
                      <button
                        type="button"
                        className="auth-dialog__reveal"
                        aria-label={showPassword ? t("authEmail.hidePassword") : t("authEmail.showPassword")}
                        aria-pressed={showPassword}
                        onClick={() => setShowPassword((v) => !v)}
                      >
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </span>
                  </label>

                  {mode === "signup" && (
                    <p className="auth-dialog__hint">{t("authEmail.passwordHint", { min: MIN_PASSWORD_LENGTH })}</p>
                  )}

                  {error && (
                    <p className="auth-dialog__error" role="alert">
                      {error}
                    </p>
                  )}

                  <button type="submit" className="auth-dialog__submit" disabled={busy}>
                    {busy
                      ? t("common.loading")
                      : mode === "signup"
                        ? t("authEmail.createAction")
                        : t("authEmail.signInAction")}
                  </button>
                </form>
              </>
            )}
          </motion.div>
    </MotionFade>,
    document.body,
  );
}

export default SignInDialog;
