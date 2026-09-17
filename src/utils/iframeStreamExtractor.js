// src/utils/iframeStreamExtractor.js - Extract stream URLs from playing video iframe
//
// Since the video is already playing in an iframe with all challenges resolved,
// we can extract the stream URL from the video element's src. This bypasses all
// server-side scraping blocks because it runs in the user's browser context.

import { logDebug, logError, logInfo, logWarn } from "./debugLogger.js";

/**
 * Extract stream URL from an iframe's video element
 * @param {HTMLIFrameElement} iframe - The iframe containing the video player
 * @returns {Promise<{url: string, type: string} | null>} - Stream URL and type
 */
export async function extractStreamFromIframe(iframe) {
  if (!iframe || !iframe.contentWindow) {
    logWarn("iframe", "Invalid iframe provided for stream extraction");
    return null;
  }

  try {
    const doc = iframe.contentDocument || iframe.contentWindow.document;
    if (!doc) {
      logWarn("iframe", "Cannot access iframe document (cross-origin)");
      return null;
    }

    // Try multiple selector patterns for video elements
    const videoSelectors = [
      "video",
      "video[src]",
      "video[data-src]",
      ".video-js video",
      "video.vjs-tech",
      "video.html5-main-video",
      "video[playsinline]",
    ];

    let videoElement = null;
    for (const selector of videoSelectors) {
      videoElement = doc.querySelector(selector);
      if (videoElement) {
        logDebug("iframe", `Found video element with selector: ${selector}`);
        break;
      }
    }

    if (!videoElement) {
      logWarn("iframe", "No video element found in iframe");
      return null;
    }

    // Get the src URL
    let streamUrl = videoElement.src || videoElement.getAttribute("data-src");
    
    // Also check currentSrc (for HLS players)
    if (!streamUrl && videoElement.currentSrc) {
      streamUrl = videoElement.currentSrc;
    }

    if (!streamUrl) {
      logWarn("iframe", "Video element has no src attribute");
      return null;
    }

    // Determine stream type
    let type = "unknown";
    if (streamUrl.includes(".m3u8")) {
      type = "hls";
    } else if (streamUrl.includes(".mp4")) {
      type = "mp4";
    } else if (streamUrl.includes(".mkv")) {
      type = "mkv";
    }

    logInfo("iframe", `Extracted stream URL: ${type}`, { url: streamUrl });
    return { url: streamUrl, type };
  } catch (error) {
    logError("iframe", "Failed to extract stream from iframe", error);
    return null;
  }
}

/**
 * Extract stream URL by sending a message to the iframe
 * This works for players that support postMessage API (like CineSrc)
 * @param {HTMLIFrameElement} iframe - The iframe containing the video player
 * @returns {Promise<{url: string, type: string} | null>} - Stream URL and type
 */
export async function extractStreamViaPostMessage(iframe) {
  return new Promise((resolve) => {
    if (!iframe || !iframe.contentWindow) {
      logWarn("iframe", "Invalid iframe for postMessage extraction");
      resolve(null);
      return;
    }

    const timeout = setTimeout(() => {
      logWarn("iframe", "PostMessage extraction timed out");
      resolve(null);
    }, 5000);

    const handleMessage = (event) => {
      // Security: Only accept messages from the iframe's origin
      try {
        const iframeOrigin = new URL(iframe.src).origin;
        if (event.origin !== iframeOrigin) return;
      } catch {
        return;
      }

      // Check for stream URL in the message
      if (event.data && event.data.streamUrl) {
        clearTimeout(timeout);
        window.removeEventListener("message", handleMessage);
        
        const { streamUrl, type = "hls" } = event.data;
        logInfo("iframe", `Extracted stream via postMessage: ${type}`, { url: streamUrl });
        resolve({ url: streamUrl, type });
      }
    };

    window.addEventListener("message", handleMessage);

    // Send a request for the stream URL
    // This works with CineSrc's postMessage API
    try {
      iframe.contentWindow.postMessage({
        type: "cinesrc:command",
        command: "getStreamUrl",
      }, new URL(iframe.src).origin);
    } catch (error) {
      logError("iframe", "Failed to send postMessage", error);
      clearTimeout(timeout);
      window.removeEventListener("message", handleMessage);
      resolve(null);
    }
  });
}

/**
 * Extract stream URL using multiple methods
 * @param {HTMLIFrameElement} iframe - The iframe containing the video player
 * @returns {Promise<{url: string, type: string} | null>} - Stream URL and type
 */
export async function extractStreamUrl(iframe) {
  logDebug("iframe", "Attempting stream URL extraction");

  // Method 1: Try postMessage API first (cleaner for supported players)
  const postMessageResult = await extractStreamViaPostMessage(iframe);
  if (postMessageResult) {
    return postMessageResult;
  }

  // Method 2: Extract from video element directly
  const directResult = await extractStreamFromIframe(iframe);
  if (directResult) {
    return directResult;
  }

  logWarn("iframe", "All extraction methods failed");
  return null;
}
