// src/components/WhisperRow.jsx - live mic → Whisper (Groq whisper-large-v3)
// → onTranscript, same shape as TMDB client layer: the Groq key stays
// SERVER-side on the same-origin /api/groq proxy (see api/groq.js), never in
// the bundlebin, so a visitor can't read or post abuse it. The transcribe
// call is groqTranscribe util arc atomic. State is typed (idle|recording|
// transcribing|error) and the button soft-fails with a toaster-style error —
// a click is NEVER a dead no-op. Consumes subtitleLiveOverride downstream.
import { useRef, useState, useEffect } from "react";
import { Mic, Square } from "lucide-react";
import { groqTranscribe } from "../utils/groqClient";
import { logDebug, logWarn } from "../utils/debugLogger";

export default function WhisperRow({ label = "Whisper", disabled = false, onTranscript }) {
  const [state, setState] = useState("idle"); // idle | recording | transcribing | error
  const [error, setError] = useState("");
  const streamRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);

  const isJsdom =
    typeof navigator !== "undefined" &&
    /jsdom/i.test(navigator.userAgent || "");

  const stopStream = () => {
    streamRef.current?.getTracks?.()?.forEach((t) => t.stop());
    streamRef.current = null;
  };

  const cleanup = () => {
    stopStream();
    if (recorderRef.current && recorderRef.current.state === "recording") {
      recorderRef.current.stop();
    }
    recorderRef.current = null;
  };

  useEffect(() => cleanup, []);

  const record = async () => {
    setError("");
    if (isJsdom) {
      setState("error");
      setError("Microphone unavailable in this environment.");
      return;
    }
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Microphone hardware is unavailable in this browser.");
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const chunks = [];
      chunksRef.current = chunks;
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      recorder.ondataavailable = (e) => {
        if (e.data?.size > 0) chunks.push(e.data);
      };
      recorder.onstop = async () => {
        const blob = new Blob(chunks, { type: "audio/webm" });
        setState("transcribing");
        try {
          const { ok, data } = await groqTranscribe({
            audioBlob: blob,
            model: "whisper-large-v3-turbo",
            language: "en",
          });
          cleanup();
          if (ok && data?.text) {
            onTranscript?.(String(data.text).trim());
            setState("idle");
          } else {
            setError(data?.status_message || "Transcription failed - is the key set server-side?");
            setState("idle");
          }
        } catch (err) {
          cleanup();
          setError(err?.message || "Transcription failed");
          setState("idle");
        }
      };
      recorder.start(1000);
      setState("recording");
      logDebug("whisper", "recording", { language: "en", provider: "groq" });
    } catch (err) {
      stopStream();
      setError(err?.message || "Microphone unavailable");
      setState("idle");
    }
  };

  const stop = () => {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  };

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        aria-label={state === "recording" ? "Stop recording" : "Start recording subtitles"}
        onClick={() => (state === "recording" ? stop() : record())}
        disabled={disabled}
        className={`whisper-row-btn group ${state === "recording" ? "is-recording" : ""}`}
      >
        {state === "recording" ? <Square size={14} /> : <Mic size={14} />}
        <span className="whisper-row-label">
          {state === "recording"
            ? "Recording — tap to stop"
            : state === "transcribing"
              ? "Transcribing…"
              : label}
        </span>
      </button>
      {error && <span className="text-xs text-red-400">{error}</span>}
    </div>
  );
}
