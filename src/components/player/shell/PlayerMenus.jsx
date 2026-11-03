// The player's menu bodies: settings, servers, subtitles, audio, video
// quality, speed, aspect, subtitle style, source quality and sleep timer.
//
// Presentation only: every row is a DialogRow over state the player already
// owns. The panel frame (header, back button, sheet animation) stays in
// PlayerPanel; this file is the page content a redesign replaces.
import {
  IconAspect,
  IconAudio,
  IconCalendar,
  IconCaptions,
  IconGauge,
  IconServers,
  IconSliders,
  IconTheater,
  DialogRow,
} from "../chrome";
import { ASPECT_RATIOS } from "../../../constants/playerUi";
import { SKIP_DATA_CREDIT } from "../../../api/skipBoundarySource";
import { languageNameFromCode } from "../../../utils/audioLabels";
import { DEFAULT_SOURCE_KEY, sourceLabel } from "../../../constants/sources";
import { fmtTime, qualityHdTag } from "../nativePlayerHelpers";

export default function PlayerMenus({
  panel,
  setPanel,
  poke,
  // Settings
  activeSourceKey,
  requestedServer,
  currentAudioLabel,
  autoLevel,
  qualities,
  manualHeight,
  currentHeight,
  playbackRate,
  onPickPlaybackRate,
  aspectRatioIndex,
  setAspectRatioIndex,
  sourceVariants,
  sourceHeight,
  pickSourceQuality,
  loopEnabled,
  setLoopEnabled,
  sleepMinutes,
  sleepRemaining,
  startSleepTimer,
  pipSupported,
  pipActive,
  togglePip,
  cueBoundaries,
  // Servers
  orderedSources,
  pickServer,
  // Subtitles
  subtitleEnabled,
  selectSubtitle,
  isFetchingSubtitles,
  subtitleLanguages,
  currentSubtitle,
  imdbId,
  subtitleError,
  subtitleSize,
  setSubtitleSize,
  subtitleBg,
  setSubtitleBg,
  // Audio
  qualityNote,
  dubTracks,
  activeDub,
  pickDub,
  audioTrackList,
  deadDubs,
  audioTracks,
  audioIndex,
  pickAudio,
  originalLanguage,
  // Video quality
  isMasterMode,
  activeUri,
  pickQuality,
  pickAuto,
}) {
  return (
    <>
      {panel === "settings" ? (
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "4px 0 6px" }}>
          {/* Audio and Subtitles were REMOVED from this list, not just
              duplicated: they now have their own buttons in the transport
              row. Leaving them here too would mean two routes to the same
              panel, and the two would disagree the moment one of them fell
              behind — which is exactly the drift the motion-token work
              already had to clean up once. Settings keeps what belongs to
              the stream rather than the viewer: server, quality, speed,
              aspect. */}
          <DialogRow
            onClick={() => setPanel("servers")}
            title="Servers"
            // What the viewer is watching right now, in the same words
            // the Servers sheet uses — not the resolver's internal key.
            // Requested wins over committed: after a failed switch the
            // committed key would highlight the server the viewer just
            // abandoned.
            sub={sourceLabel(activeSourceKey || requestedServer || DEFAULT_SOURCE_KEY, "Server 1")}
            icon={<IconServers size={20} />}
            hasChevron
          />
          <DialogRow
            onClick={() => setPanel("audio")}
            title="Audio track"
            sub={currentAudioLabel}
            icon={<IconAudio size={20} />}
            hasChevron
          />
          <DialogRow
            onClick={() => setPanel("video")}
            title="Video Quality"
            sub={autoLevel === false ? (qualities.find(q => q.height === manualHeight)?.label || (currentHeight ? currentHeight + "p" : "Manual")) : "Auto"}
            icon={<IconSliders size={20} />}
            hasChevron
          />
          <DialogRow
            onClick={() => setPanel("speed")}
            title="Playback Speed"
            sub={playbackRate === 1 ? "Normal" : `${playbackRate}x`}
            icon={<IconGauge size={20} />}
            hasChevron
          />
          <DialogRow
            onClick={() => setPanel("aspect")}
            title="Aspect Ratio"
            sub={ASPECT_RATIOS[aspectRatioIndex]?.name || "Fit"}
            icon={<IconAspect size={20} />}
            hasChevron
          />
          {/* Provider "Source quality" parity: the RAW source resolution
              (distinct from the delivered-ladder "Video Quality" above).
              Only surfaced when the picked server actually offers a
              multi-resolution source — never an empty selector. */}
          {sourceVariants.length > 1 ? (
            <DialogRow
              onClick={() => setPanel("sourcequality")}
              title="Source quality"
              sub={sourceHeight ? `${sourceHeight}p` : "Auto"}
              icon={<IconSliders size={20} />}
              hasChevron
            />
          ) : null}
          {/* Loop is a direct toggle (selected shows the check); the sleep
              timer opens its own chooser. Both mirror the provider's
              Playback menu. */}
          <DialogRow
            onClick={() => {
              setLoopEnabled((v) => !v);
              poke();
            }}
            title="Loop"
            sub={loopEnabled ? "On" : "Off"}
            selected={loopEnabled}
          />
          <DialogRow
            onClick={() => setPanel("sleep")}
            title="Sleep timer"
            sub={sleepMinutes ? `${fmtTime(sleepRemaining ?? sleepMinutes * 60)} left` : "Off"}
            icon={<IconCalendar size={20} />}
            hasChevron
          />
          {pipSupported ? (
            <DialogRow
              onClick={() => {
                togglePip();
                poke();
              }}
              title="Picture in picture"
              sub={pipActive ? "On" : "Off"}
              icon={<IconTheater size={20} />}
            />
          ) : null}
          {/* The SkipDB data licence (ODbL) requires attribution wherever
              its boundaries are used, so this is a licence term, not a
              nicety. Gated on `source === "dataset"` so we credit it only
              for titles where its data actually reached the player —
              attribution for data we never used would be false. */}
          {cueBoundaries?.source === "dataset" ? (
            <p
              style={{
                fontSize: 11,
                color: "rgba(255,255,255,0.35)",
                margin: "12px 14px 2px",
                lineHeight: 1.5,
              }}
            >
              Skip boundaries by{" "}
              <a
                href={SKIP_DATA_CREDIT.url}
                target="_blank"
                rel="noreferrer noopener"
                style={{ color: "rgba(255,255,255,0.55)" }}
              >
                {SKIP_DATA_CREDIT.name}
              </a>{" "}
              (open data, ODbL).
            </p>
          ) : null}
        </div>
      ) : panel === "servers" ? (
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "4px 0 6px" }}>
            <p style={{ fontSize: 12, color: "#a1a1aa", margin: "4px 14px 8px", lineHeight: 1.45 }}>
              Same title, different stream providers. Switching reloads the
              stream from the chosen server.
            </p>
            {orderedSources.map((s) => (
              <DialogRow
                key={s.key}
                selected={(activeSourceKey || requestedServer || DEFAULT_SOURCE_KEY) === s.key}
                onClick={() => pickServer(s.key)}
                title={s.label}
                sub={s.tag}
              />
            ))}
        </div>
      ) : panel === "subs" ? (
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "4px 0 6px" }}>
            <DialogRow
              key="off"
              selected={!subtitleEnabled}
              onClick={() => selectSubtitle(null)}
              title="Off"
            />
            {isFetchingSubtitles ? (
              <p style={{ fontSize: 12.5, color: "#a1a1aa", margin: "8px 14px 4px", lineHeight: 1.45 }}>
                Searching OpenSubtitles…
              </p>
            ) : subtitleLanguages.length > 0 ? (
              subtitleLanguages.map((s) => (
                <DialogRow
                  key={s.languageId || s.language}
                  selected={
                    subtitleEnabled &&
                    s.languageId === currentSubtitle?.languageId &&
                    s.language === currentSubtitle?.language
                  }
                  onClick={() => selectSubtitle(s)}
                  title={s.language}
                />
              ))
            ) : (
              <p style={{ fontSize: 12.5, color: "#a1a1aa", margin: "8px 14px 4px", lineHeight: 1.45 }}>
                {!imdbId
                  ? "No subtitles found for this title on OpenSubtitles (no IMDb id — title search also came up empty)."
                  : "No subtitles found for this title on OpenSubtitles."}
              </p>
            )}
            {subtitleError ? (
              <p role="alert" style={{ fontSize: 12.5, color: "#ff9d9d", margin: "8px 14px 4px", lineHeight: 1.5 }}>
                {subtitleError}
              </p>
            ) : null}
            {/* Provider "Subtitle settings" parity: styling of the caption
                line (size + background), presentation-only and persisted
                separately from the chosen track. */}
            <DialogRow
              onClick={() => setPanel("substyle")}
              title="Subtitle style"
              sub={`${["Small", "Medium", "Large"][subtitleSize] || "Medium"} · ${["None", "Shadow", "Box"][subtitleBg] || "Shadow"}`}
              icon={<IconCaptions size={20} />}
              hasChevron
            />
        </div>
      ) : panel === "audio" ? (
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "4px 0 6px" }}>
            {qualityNote ? (
              <p
                role="status"
                style={{
                  fontSize: 11.5,
                  fontWeight: 600,
                  color: "#ffb4b4",
                  margin: "4px 14px 8px",
                  lineHeight: 1.5,
                }}
              >
                {qualityNote}
              </p>
            ) : null}
            {dubTracks.length > 0 ? (
              // Sibling-URL dubs (NHD, ZXC Centaurus): one MASTER per dub,
              // switched by swapping the source (pickDub) — NOT hls.js
              // audio groups.
              //
              // Checked BEFORE audioTracks on purpose: a transcoded DASH
              // master always carries an in-manifest #EXT-X-MEDIA group
              // (the muxed AAC), so testing audioTracks first would show
              // one lonely "eng" row and hide every real dub behind it.
              // The sibling list is a superset — it starts at the original.
              <>
                {/* Row 0 is the original, named by the SOURCE's own
                    original-track language when it reports one (falling back
                    to TMDB's film language), never the bare word "Original"
                    — but never a guess that collides with a real dub row. */}
                <DialogRow
                  key="dub-original"
                  selected={activeDub === 0}
                  onClick={() => pickDub(0)}
                  title={audioTrackList[0]?.label || "Original"}
                  sub="This source's soundtrack"
                />
                {/* ALL siblings get rows: the provider's own player
                    highlights tracks[0] while playing the main URL, so
                    track[0] is NOT provably the original soundtrack —
                    hiding it would hide a real language. Labels are the
                    normalised language names from audioLabels.js. */}
                {audioTrackList.slice(1).map((t) => {
                  /* sourceIndex, NOT the row's own position: buildAudioTrackList
                     drops duplicate/empty rows, so positional indexing here
                     would play a different language than the one clicked. */
                  const dead = deadDubs.has(t.sourceIndex + 1);
                  return (
                    <DialogRow
                      key={`dub-${t.sourceIndex}`}
                      selected={activeDub === t.sourceIndex + 1}
                      onClick={() => pickDub(t.sourceIndex + 1)}
                      title={t.label}
                      sub={dead ? "Not available on this server" : undefined}
                      disabled={dead}
                    />
                  );
                })}
              </>
            ) : audioTracks.length > 0 ? (
              audioTracks.map((a) => {
                // Name the group by its language CODE: a transcoded DASH
                // master labels the audio group "eng"/"hin"/"fra", which is
                // not a name a viewer should read.
                const proper = languageNameFromCode(a.lang || a.name);
                return (
                  <DialogRow
                    key={a.index}
                    selected={a.index === audioIndex}
                    onClick={() => pickAudio(a.index)}
                    title={proper || a.name}
                    sub={proper && a.lang && a.lang !== a.name ? a.lang : undefined}
                  />
                );
              })
            ) : (
              // No #EXT-X-MEDIA AUDIO groups: hls.js reports no audioTracks, but the
              // soundtrack IS playing — surface it as the single track.
              <>
                {originalLanguage ? (
                  <p
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: "rgba(255,255,255,0.5)",
                      margin: "4px 14px 8px",
                      letterSpacing: "0.02em",
                    }}
                  >
                    Film's original language:{" "}
                    {languageNameFromCode(originalLanguage) || (originalLanguage || "").toUpperCase() || "Unknown"}
                  </p>
                ) : null}
                <DialogRow
                  key="original"
                  selected
                  title={originalLanguage ? `Original — ${languageNameFromCode(originalLanguage) || (originalLanguage || "").toUpperCase() || "Unknown"}` : "Original"}
                  sub="This source's soundtrack"
                />
              </>
            )}
        </div>
      ) : panel === "video" ? (
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "4px 0 6px" }}>
            {qualityNote ? (
              <p
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: "rgba(255,255,255,0.5)",
                  margin: "4px 14px 8px",
                  letterSpacing: "0.02em",
                }}
              >
                {qualityNote}
              </p>
            ) : null}
            {/* Auto is ALWAYS present — the active mode on every source
                (master = hls.js ABR; per-rendition sources = the rung the
                player negotiated at open, smooth-start / relay-friendly). */}
            <DialogRow
              selected={autoLevel}
              onClick={pickAuto}
              title="Auto"
              sub={
                autoLevel && currentHeight != null
                  ? `Now ${qualities.find((q) => q.height === currentHeight)?.label || `${currentHeight}p`} · adjusts with your connection`
                  : "Adjusts with your connection"
              }
            />
            {qualities.map((q, i) => {
              // autoLevel === null means "nothing opened yet" — no active row
              // is honest there. The legacy per-rendition case keys on the
              // ENTRY URI, but a quality pick rewrote activeUri to the picked
              // rendition, so a fixed-ladder source keys on manualHeight too
              // (set for masters AND for per-rendition picks alike).
              const selected = autoLevel === false
                ? manualHeight != null
                  ? q.height === manualHeight
                  : q.uri === activeUri
                : autoLevel === true && isMasterMode
                  ? currentHeight != null && q.height === currentHeight
                  : false;
              return (
                <DialogRow
                  key={`${q.uri}::${i}`}
                  selected={selected}
                  onClick={() => pickQuality(q.uri, q.height, { external: q.external })}
                  title={`${q.label || `${q.height}p`}${qualityHdTag(q) ? " HD" : ""}`}
                />
              );
            })}
        </div>
      ) : panel === "speed" ? (
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "4px 0 6px" }}>
            {[0.25, 0.5, 0.75, 1, 1.25, 1.5, 2].map((rate) => (
              <DialogRow
                key={rate}
                selected={playbackRate === rate}
                onClick={() => onPickPlaybackRate(rate)}
                title={rate === 1 ? "Normal (1x)" : `${rate}x`}
              />
            ))}
        </div>
      ) : panel === "aspect" ? (
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "4px 0 6px" }}>
            {ASPECT_RATIOS.map((aspect, idx) => (
              <DialogRow
                /* `name`, not `label`: the catalog has only ever had
                   `name`. Reading `.label` here made every option's text
                   undefined, so the whole panel rendered as six blank
                   rows — the reason the aspect labels looked "missing".
                   Keyed on id so rows stay stable. */
                key={aspect.id}
                selected={aspectRatioIndex === idx}
                onClick={() => {
                  setAspectRatioIndex(idx);
                  setPanel(null);
                  poke();
                }}
                title={aspect.name}
                sub={aspect.sub}
              />
            ))}
        </div>
      ) : panel === "substyle" ? (
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "4px 0 6px" }}>
            <p style={{ fontSize: 12, color: "#a1a1aa", margin: "4px 14px 8px", lineHeight: 1.45 }}>
              Appearance of the caption line. Applies to the track you pick
              in the Subtitles menu.
            </p>
            <p style={{ fontSize: 11.5, fontWeight: 700, color: "rgba(255,255,255,0.5)", margin: "4px 14px 6px", letterSpacing: "0.02em" }}>
              SIZE
            </p>
            {["Small", "Medium", "Large"].map((name, i) => (
              <DialogRow
                key={name}
                selected={subtitleSize === i}
                onClick={() => setSubtitleSize(i)}
                title={name}
              />
            ))}
            <p style={{ fontSize: 11.5, fontWeight: 700, color: "rgba(255,255,255,0.5)", margin: "12px 14px 6px", letterSpacing: "0.02em" }}>
              BACKGROUND
            </p>
            {["None", "Shadow", "Box"].map((name, i) => (
              <DialogRow
                key={name}
                selected={subtitleBg === i}
                onClick={() => setSubtitleBg(i)}
                title={name}
              />
            ))}
        </div>
      ) : panel === "sourcequality" ? (
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "4px 0 6px" }}>
            <p style={{ fontSize: 12, color: "#a1a1aa", margin: "4px 14px 8px", lineHeight: 1.45 }}>
              The provider's raw source file resolution. Different from Video
              Quality, which picks a rung of the stream we deliver.
            </p>
            <DialogRow
              selected={!sourceHeight}
              onClick={() => pickSourceQuality(0)}
              title="Auto"
              sub="The provider's own default link"
            />
            {sourceVariants.map((v) => (
              <DialogRow
                key={v.height}
                selected={sourceHeight === v.height}
                onClick={() => pickSourceQuality(v.height)}
                title={v.label || `${v.height}p`}
              />
            ))}
        </div>
      ) : panel === "sleep" ? (
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "4px 0 6px" }}>
            <DialogRow
              selected={!sleepMinutes}
              onClick={() => {
                startSleepTimer(0);
                setPanel(null);
                poke();
              }}
              title="Off"
            />
            {[15, 30, 45, 60].map((min) => (
              <DialogRow
                key={min}
                selected={sleepMinutes === min}
                onClick={() => {
                  startSleepTimer(min);
                  setPanel(null);
                  poke();
                }}
                title={`${min} minutes`}
              />
            ))}
            {sleepMinutes ? (
              <p style={{ fontSize: 12, color: "#a1a1aa", margin: "8px 14px 4px" }}>
                Pausing in {fmtTime(sleepRemaining ?? sleepMinutes * 60)}.
              </p>
            ) : null}
        </div>
      ) : null}

    </>
  );
}
