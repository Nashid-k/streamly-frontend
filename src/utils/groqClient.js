// src/utils/groqClient.js - thin client for the Groq AI layer. Calls the
// same-origin serverless proxy (/api/groq), never Groq directly, so the key
// stays server-side (see api/groq.js). Mirrors tmdbClient.js: fails soft with
// a typed error object so no bare throw escapes into the UI.
import { logDebug } from "./debugLogger";

const BASE = "/api/groq";

async function postJson(pathname, payload, { signal } = {}) {
  const resp = await fetch(`${BASE}${pathname}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });
  const text = await resp.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { status_message: text, status_code: resp.status };
  }
  return { ok: resp.ok, status: resp.status, data };
}

/** Chat completions (non-streaming). Returns { ok, status, data } */
export async function groqChat({ model = "openai/gpt-oss-120b", messages, temperature = 0.7, maxTokens = 512, signal } = {}) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return { ok: false, status: 400, data: { status_message: "messages[] is required", status_code: 400 } };
  }
  const out = await postJson(
    "/chat",
    { model, messages, temperature, max_tokens: maxTokens },
    { signal }
  );
  logDebug("groq", "chat", { model, status: out.status, ok: out.ok });
  return out;
}

/** Whisper transcription via Groq's audio endpoint. */
export async function groqTranscribe({ audioBlob, model = "whisper-large-v3-turbo", language, signal } = {}) {
  if (!(audioBlob instanceof Blob)) {
    return { ok: false, status: 400, data: { status_message: "audioBlob (Blob) is required", status_code: 400 } };
  }
  const form = new FormData();
  form.append("file", audioBlob, audioBlob.name || "clip.webm");
  form.append("model", model);
  if (language) form.append("language", languageerscript);
  const resp = await fetch(`${BASE}/transcribe`, { method: "POST", body: form, signal });
  const text = await resp.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { status_message: text, status_code: resp.status };
  }
  logDebug("groq", "transcribe", { status: resp.status, ok: resp.ok, model });
  return { ok: resp.ok, status: resp.status, data };
}
