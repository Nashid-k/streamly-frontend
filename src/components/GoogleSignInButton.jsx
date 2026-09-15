// src/components/GoogleSignInButton.jsx — Google Sign-In Button with GIS & Fallback support
import { useEffect, useRef, useState } from "react";
import { useAppAuth } from "../context/auth";
import { useToast } from "./Toast.jsx";
import { renderGoogleButton, promptGoogleSignIn } from "../utils/googleAuth";
import { logDebug, logError } from "../utils/debugLogger";

export function GoogleLogoIcon({ size = 18, className = "" }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        fill="#4285F4"
        d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.34 24 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.34 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
      />
    </svg>
  );
}

export default function GoogleSignInButton({
  onSuccess,
  onError,
  className = "",
  style = {},
  shape = "pill",
  text = "Continue with Google",
}) {
  const { loginWithGoogle } = useAppAuth();
  const { toast } = useToast();
  const googleBtnContainerRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [gisLoaded, setGisLoaded] = useState(false);

  useEffect(() => {
    let active = true;

    async function setupGis() {
      if (!googleBtnContainerRef.current) return;

      try {
        await renderGoogleButton(googleBtnContainerRef.current, {
          onCredential: async (credential) => {
            setLoading(true);
            const result = await loginWithGoogle(credential);
            setLoading(false);
            if (result.success) {
              toast({
                type: "success",
                title: "Signed In",
                message: `Welcome to Streamly, ${result.user.name}!`,
              });
              onSuccess?.(result.user);
            } else {
              toast({
                type: "error",
                title: "Sign-In Failed",
                message: result.message || "Google authentication failed.",
              });
              onError?.(new Error(result.message));
            }
          },
          onError: (err) => {
            logError("auth", "Google GIS render error:", err);
            onError?.(err);
          },
          theme: "filled_black",
          text: "signin_with",
          shape,
          width: 320,
        });

        if (active) setGisLoaded(true);
      } catch (err) {
        logDebug("auth", "Could not render official GIS button; using custom button.", { message: err?.message });
      }
    }

    setupGis();

    return () => {
      active = false;
    };
  }, [loginWithGoogle, shape, toast, onSuccess, onError]);

  const handleCustomClick = async () => {
    setLoading(true);
    try {
      await promptGoogleSignIn({
        onCredential: async (credential) => {
          const result = await loginWithGoogle(credential);
          setLoading(false);
          if (result.success) {
            toast({
              type: "success",
              title: "Signed In",
              message: `Welcome, ${result.user.name}!`,
            });
            onSuccess?.(result.user);
          } else {
            toast({
              type: "error",
              title: "Sign-In Failed",
              message: result.message || "Google sign-in could not be completed.",
            });
            onError?.(new Error(result.message));
          }
        },
        onError: (err) => {
          setLoading(false);
          logError("auth", "Google sign-in prompt failed:", err);
          toast({
            type: "error",
            title: "Google Sign-In",
            message: "Google sign-in prompt could not be opened. Check popup or ad blocker settings.",
          });
          onError?.(err);
        },
      });
    } catch (err) {
      setLoading(false);
      logError("auth", "Custom Google Sign-In click error:", err);
    }
  };

  return (
    <div className={`google-signin-wrapper ${className}`} style={{ width: "100%", ...style }}>
      {/* Official GIS container rendered by Google SDK */}
      <div
        ref={googleBtnContainerRef}
        style={{
          display: gisLoaded ? "flex" : "none",
          justifyContent: "center",
          width: "100%",
          minHeight: 44,
        }}
      />

      {/* Fallback button if GIS script is loading or blocked by extensions */}
      {!gisLoaded && (
        <button
          type="button"
          onClick={handleCustomClick}
          disabled={loading}
          className="w-full flex items-center justify-center gap-3 px-5 py-3 rounded-full bg-white text-gray-900 font-semibold text-sm hover:bg-gray-100 active:scale-[0.98] transition-all duration-150 shadow-md border-none cursor-pointer disabled:opacity-60"
          style={{
            fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', Roboto, sans-serif",
            letterSpacing: "0.2px",
          }}
        >
          {loading ? (
            <div className="w-4 h-4 rounded-full border-2 border-gray-400 border-t-gray-900 animate-spin" />
          ) : (
            <GoogleLogoIcon size={19} />
          )}
          <span>{loading ? "Signing in..." : text}</span>
        </button>
      )}
    </div>
  );
}
