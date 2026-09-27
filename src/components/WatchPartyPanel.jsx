// src/components/WatchPartyPanel.jsx — Watch Party in-player panel.
//
// Rendered inside NativePlayerView as its own settings-style sheet. Three
// states: (1) no party → create / join-by-code; (2) connected → code chip +
// copy-link, roster, chat, leave; (3) lost/error → the real error + reconnect.
// All state comes from useWatchParty; the panel never talks to the endpoint
// directly, and every failure lands as visible text (no silent failures).

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Check,
  Copy,
  LogOut,
  MessageSquare,
  Send,
  Users,
} from "lucide-react";

const MAX_MESSAGE_INPUT = 280;

function formatTime(at) {
  try {
    return new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

export default function WatchPartyPanel({
  party, // the whole useWatchParty() result
  onBack, // close the panel (player header back arrow)
  onCollapse, // shrink to the compact bubble
  activeTitle, // { titleId, title, kind, season, episode } for create/sync
}) {
  const {
    identity,
    room,
    isHost,
    status,
    error,
    chat,
    create,
    join,
    leave,
    sendChat,
  } = party;

  const [mode, setMode] = useState("menu"); // menu | create | join
  const [nameInput, setNameInput] = useState(identity?.name || "");
  // Render-time state adjustment (React-documented pattern): when the identity
  // materializes/changes after mount (create/join generate a Guest name), the
  // name field follows it — without a setState-in-effect lint hit.
  const [prevIdentityName, setPrevIdentityName] = useState(identity?.name || "");
  if ((identity?.name || "") !== prevIdentityName) {
    setPrevIdentityName(identity?.name || "");
    setNameInput(identity?.name || "");
  }
  const [codeInput, setCodeInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [draft, setDraft] = useState("");
  const chatEndRef = useRef(null);
  const connected = status === "connected";

  // Autoscroll chat as new messages land (only when already near the bottom,
  // so reading history isn't yanked around).
  useEffect(() => {
    const el = chatEndRef.current;
    if (!el) return;
    const box = el.parentElement;
    if (!box) return;
    const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 120;
    // Guarded: jsdom (and some embedded browsers) do not implement it.
    if (nearBottom && typeof el.scrollIntoView === "function") el.scrollIntoView({ block: "end" });
  }, [chat.length]);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- identity?.name handled via render-time adjust above

  const code = room?.code || "";
  const shareUrl = useMemo(() => {
    if (typeof window === "undefined" || !code) return "";
    return `${window.location.origin}/watch/${activeTitle?.titleId || ""}?party=${code}`;
  }, [code, activeTitle?.titleId]);

  const handleCreate = async () => {
    setBusy(true);
    try {
      await create({ name: nameInput, title: activeTitle });
      setMode("menu");
    } finally {
      setBusy(false);
    }
  };

  const handleJoin = async () => {
    setBusy(true);
    try {
      const ok = await join({ code: codeInput, name: nameInput });
      if (ok) setMode("menu");
    } finally {
      setBusy(false);
    }
  };

  // Copy the invite link (any member's copy works, host or guest).
  const handleCopy = () => {
    const text = shareUrl;
    if (!text) return;
    const done = () => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(() => {
        // Clipboard blocked (permissions/insecure context) — fall back.
        fallbackCopy(text);
        done();
      });
    } else {
      fallbackCopy(text);
      done();
    }
  };

  function fallbackCopy(text) {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    } catch {
      // best-effort
    }
  }

  const inputStyle = {
    width: "100%",
    boxSizing: "border-box",
    background: "rgba(255,255,255,0.08)",
    border: "1px solid rgba(255,255,255,0.15)",
    borderRadius: 4,
    color: "#fff",
    padding: "10px 12px",
    fontSize: 14,
    outline: "none",
  };

  const primaryBtn = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    background: "#e50914",
    color: "#fff",
    border: "none",
    borderRadius: 4,
    padding: "10px 16px",
    fontWeight: 700,
    fontSize: 14,
    cursor: "pointer",
  };

  const ghostBtn = {
    ...primaryBtn,
    background: "rgba(255,255,255,0.1)",
  };

  /* ---------------- Not connected: menu / create / join ---------------- */
  if (!connected) {
    // Any failure the hook recorded (bad code, room gone, network) reads here.
    const shownError = status === "error" || status === "lost" || status === "left" ? error : null;
    return (
      <div style={{ padding: "4px 16px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
        {shownError ? (
          <div
            role="alert"
            style={{
              background: "rgba(229,9,20,0.15)",
              border: "1px solid rgba(229,9,20,0.5)",
              borderRadius: 4,
              padding: "10px 12px",
              fontSize: 13,
              color: "#ffb3b3",
            }}
          >
            {shownError}
            {code ? (
              <div style={{ marginTop: 8, fontSize: 12, color: "rgba(255,255,255,0.7)" }}>
                The room may still exist for others — rejoin with code{" "}
                <strong style={{ letterSpacing: 2 }}>{code}</strong>.
              </div>
            ) : null}
          </div>
        ) : null}

        {mode === "menu" ? (
          <>
            <p style={{ margin: 0, fontSize: 13, color: "rgba(255,255,255,0.65)", lineHeight: 1.5 }}>
              Watch together in sync. The host controls playback; everyone sees the same moment and can chat.
            </p>
            <label style={{ fontSize: 12, color: "rgba(255,255,255,0.6)" }}>
              Your name
              <input
                style={{ ...inputStyle, marginTop: 4 }}
                value={nameInput}
                maxLength={24}
                onChange={(e) => setNameInput(e.target.value)}
                placeholder="Guest"
                aria-label="Your name"
              />
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" style={primaryBtn} onClick={handleCreate} disabled={busy}>
                Create party
              </button>
              <button
                type="button"
                style={ghostBtn}
                onClick={() => {
                  setCodeInput("");
                  setMode("join");
                }}
                disabled={busy}
              >
                Join with code
              </button>
            </div>
          </>
        ) : null}

        {mode === "join" ? (
          <>
            <button
              type="button"
              onClick={() => setMode("menu")}
              aria-label="Back to party menu"
              style={{
                alignSelf: "flex-start",
                background: "transparent",
                border: "none",
                color: "#fff",
                display: "flex",
                alignItems: "center",
                gap: 4,
                cursor: "pointer",
                padding: 0,
                fontSize: 13,
              }}
            >
              <ArrowLeft size={16} /> Back
            </button>
            <label style={{ fontSize: 12, color: "rgba(255,255,255,0.6)" }}>
              Party code
              <input
                style={{ ...inputStyle, marginTop: 4, letterSpacing: 6, textTransform: "uppercase", fontWeight: 700 }}
                value={codeInput}
                maxLength={6}
                onChange={(e) => setCodeInput(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
                placeholder="ABC123"
                aria-label="Party code"
                inputMode="text"
                autoCapitalize="characters"
              />
            </label>
            <button type="button" style={primaryBtn} onClick={handleJoin} disabled={busy || codeInput.length !== 6}>
              Join party
            </button>
          </>
        ) : null}
      </div>
    );
  }

  /* ---------------- Connected: roster + chat ---------------- */
  const roster = room?.participants || [];
  const hostName = roster.find((p) => p.isHost)?.name || "Host";

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      {/* Code + share */}
      <div style={{ padding: "0 16px 12px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 4,
            padding: "10px 12px",
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", textTransform: "uppercase", letterSpacing: 1 }}>
              Party code
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: 4, color: "#fff" }}>{code}</div>
          </div>
          <button
            type="button"
            className="np-icon-btn"
            onClick={handleCopy}
            aria-label="Copy invite link"
            title="Copy invite link"
            style={{ background: "rgba(255,255,255,0.1)", border: "none", color: "#fff", cursor: "pointer", width: 36, height: 36, borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            {copied ? <Check size={16} /> : <Copy size={16} />}
          </button>
        </div>
        <div style={{ fontSize: 12, color: isHost ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.45)", marginTop: 8 }}>
          {isHost
            ? "You control playback for everyone."
            : `${hostName} controls playback. Sit back and chat.`}
        </div>
      </div>

      {/* Roster */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
          padding: "0 16px 10px",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
        }}
        aria-label="Party members"
      >
        <Users size={14} style={{ color: "rgba(255,255,255,0.5)" }} />
        {roster.map((p) => (
          <span
            key={p.participantId}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              fontSize: 12,
              color: "#fff",
              background: p.isHost ? "rgba(229,9,20,0.35)" : "rgba(255,255,255,0.1)",
              borderRadius: 999,
              padding: "3px 10px",
              fontWeight: p.isHost ? 700 : 400,
            }}
          >
            {p.name}
            {p.participantId === identity?.participantId ? " (you)" : ""}
            {p.isHost ? " · host" : ""}
          </span>
        ))}
      </div>

      {/* Chat */}
      <div
        style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "10px 16px", display: "flex", flexDirection: "column", gap: 8 }}
        role="log"
        aria-label="Party chat"
        aria-live="polite"
      >
        {chat.length === 0 ? (
          <p style={{ margin: 0, fontSize: 13, color: "rgba(255,255,255,0.45)" }}>
            Say hi — everyone in the party sees this chat.
          </p>
        ) : null}
        {chat.map((m) => {
          const mine = m.participantId === identity?.participantId;
          return (
            <div key={m.id} style={{ alignSelf: mine ? "flex-end" : "flex-start", maxWidth: "85%" }}>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginBottom: 2 }}>
                {mine ? "You" : m.name} · {formatTime(m.at)}
              </div>
              <div
                style={{
                  background: mine ? "rgba(229,9,20,0.85)" : "rgba(255,255,255,0.1)",
                  color: "#fff",
                  borderRadius: mine ? "12px 12px 2px 12px" : "12px 12px 12px 2px",
                  padding: "8px 12px",
                  fontSize: 14,
                  lineHeight: 1.45,
                  overflowWrap: "anywhere",
                }}
              >
                {m.text}
              </div>
            </div>
          );
        })}
        <div ref={chatEndRef} />
      </div>

      {/* Composer + footer actions */}
      <div style={{ padding: "10px 16px 0", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            style={{ ...inputStyle, flex: 1 }}
            value={draft}
            maxLength={MAX_MESSAGE_INPUT}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              // Enter sends; the player's global keymap must NOT fire while
              // typing (handled by stopPropagation here + the player's own
              // input guard on its keydown listener).
              if (e.key === "Enter" && !e.shiftKey) {
                e.stopPropagation();
                e.preventDefault();
                const text = draft.trim();
                if (!text) return;
                setDraft("");
                sendChat(text);
              } else {
                e.stopPropagation();
              }
            }}
            placeholder="Message the party…"
            aria-label="Chat message"
          />
          <button
            type="button"
            className="np-icon-btn"
            onClick={() => {
              const text = draft.trim();
              if (!text) return;
              setDraft("");
              sendChat(text);
            }}
            aria-label="Send message"
            style={{ background: "#e50914", border: "none", color: "#fff", cursor: "pointer", width: 38, height: 38, borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            <Send size={16} />
          </button>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "8px 0 calc(8px + env(safe-area-inset-bottom, 0px))",
          }}
        >
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", display: "inline-flex", alignItems: "center", gap: 4 }}>
            <MessageSquare size={12} /> {chat.length} messages
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" style={{ ...ghostBtn, padding: "6px 12px", fontSize: 12 }} onClick={() => onCollapse?.()}>
              Minimize
            </button>
            <button
              type="button"
              style={{ ...primaryBtn, padding: "6px 12px", fontSize: 12 }}
              onClick={() => {
                leave();
                setMode("menu");
              }}
            >
              <LogOut size={14} /> {isHost ? "End party" : "Leave"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
