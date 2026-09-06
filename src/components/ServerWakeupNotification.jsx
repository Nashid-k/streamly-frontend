import React, { useEffect, useState } from "react";

export function ServerWakeupNotification() {
  const [visible, setVisible] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    let fadeTimer;
    const handleWakeup = () => {
      setMounted(true);
      setTimeout(() => setVisible(true), 50);
    };
    const handleDone = () => {
      setVisible(false);
      fadeTimer = setTimeout(() => setMounted(false), 400); // wait for fade-out before unmounting
    };

    window.addEventListener("server-wakeup", handleWakeup);
    window.addEventListener("server-wakeup-done", handleDone);

    return () => {
      clearTimeout(fadeTimer);
      window.removeEventListener("server-wakeup", handleWakeup);
      window.removeEventListener("server-wakeup-done", handleDone);
    };
  }, []);

  if (!mounted) return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: "20px",
        left: "50%",
        transform: visible
          ? "translateX(-50%) translateY(0)"
          : "translateX(-50%) translateY(12px)",
        opacity: visible ? 1 : 0,
        transition:
          "opacity 0.35s ease, transform 0.35s cubic-bezier(0.34,1.56,0.64,1)",
        backgroundColor: "rgba(9, 9, 11, 0.92)",
        color: "white",
        padding: "12px 24px",
        borderRadius: "24px",
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        gap: "12px",
        boxShadow:
          "0 8px 32px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.08)",
        fontFamily: "Inter, sans-serif",
        fontSize: "14px",
        fontWeight: 500,
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
      }}
    >
      <div
        style={{
          width: "16px",
          height: "16px",
          border: "2px solid rgba(255,255,255,0.2)",
          borderTop: "2px solid #f43f5e",
          borderRadius: "50%",
          animation: "spin 0.9s linear infinite",
          flexShrink: 0,
        }}
      />
      Connecting to server…
      <style
        dangerouslySetInnerHTML={{
          __html: `
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
      `,
        }}
      />
    </div>
  );
}
