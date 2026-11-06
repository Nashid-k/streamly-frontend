// The player's menu pages: the reference design's 2×2 tile root, Source,
// Quality, Subtitles, Audio, Playback settings, Appearance, Source quality,
// Subtitle style and Seasons.
//
// Player v4 enhancements:
// - 4 Tiles with .tile and .np-tile
// - 3 Chevron rows (Playback, Appearance, Subtitle style)
// - Appearance pane: Control icon size slider (0.5-2.2x), 8 preset themes, custom hex picker
// - Captions pane: Live preview box, size (S/M/L/XL), background style (shadow/box/outline), color (White/Yellow/Cyan/Green)
// - Episodes pane: .row.ep, badge .eb, air date, watched status, active indicator
import { useEffect } from "react";
import {
  DialogRow,
} from "../chrome";
import { PLAYER_V4_THEMES } from "../chrome/theme";
import { ASPECT_RATIOS, PLAYER_SPEEDS } from "../../../constants/playerUi";
import { SKIP_DATA_CREDIT } from "../../../api/skipBoundarySource";
import { languageNameFromCode } from "../../../utils/audioLabels";
import { AUTO_SOURCE, DEFAULT_SOURCE_KEY, sourceLabel, sourceByKey, sourceByServer } from "../../../constants/sources";
import { qualityHdTag } from "../nativePlayerHelpers";
import { formatAirsDate, isEpAired } from "../../../utils/titleDetails";

function Tile({ label, value, ariaLabel, onClick }) {
  return (
    <button type="button" className="np-tile tile" aria-label={ariaLabel} onClick={onClick}>
      <small className="np-tile-k">{label}</small>
      <b className="np-tile-v">{value}</b>
    </button>
  );
}

function Pick({ selected, onClick, children, disabled }) {
  return (
    <button
      type="button"
      className={["np-pick", "row", selected ? "sel" : ""].filter(Boolean).join(" ")}
      aria-checked={selected ? "true" : "false"}
      aria-pressed={selected ? "true" : undefined}
      disabled={disabled}
      onClick={disabled ? undefined : onClick}
    >
      <span className="np-pick-name">{children}</span>
      <svg className="ic ck"><use href="#i-check" /></svg>
    </button>
  );
}

function Seg({ options, value, onChange, ariaLabel }) {
  const colClass = options.length === 4 ? "c4" : options.length === 3 ? "c3" : "";
  return (
    <div
      className={["seg", colClass].filter(Boolean).join(" ")}
      role="radiogroup"
      aria-label={ariaLabel}
    >
      {options.map((o) => {
        const isSel = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={isSel}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

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
  // Playback
  autoplayEnabled,
  onToggleAutoplay,
  showEpisodesButton,
  // Episodes
  episodes,
  episode,
  chooseEpisode,
  season,
  /* v4 episodes pane: per-season watched set, the parent's single resume
     point, and this element's progress for the "Now playing" bar. */
  watchedEpisodes,
  resumePoint,
  currentTime,
  safeDuration,
  setBuffering,
  setResumeOffer,
  // v4 Appearance bundle
  v4Appearance,
}) {
  const committedServer =
    activeSourceKey && activeSourceKey !== AUTO_SOURCE.key ? activeSourceKey : null;
  const requested =
    requestedServer && requestedServer !== AUTO_SOURCE.key ? requestedServer : null;
  const rawServer = requested || committedServer || DEFAULT_SOURCE_KEY;
  const resolvedServerObj = sourceByKey(rawServer) || sourceByServer(rawServer);
  const serverKey = resolvedServerObj?.key || rawServer;
  const serverValue = resolvedServerObj?.label || sourceLabel(serverKey, "Server 1");

  const currentHeightLabel = currentHeight ? `${currentHeight}p` : null;
  const manualQualityObj = qualities.find((q) => q.height === manualHeight);
  const qualityValue =
    autoLevel === false
      ? manualQualityObj?.label || currentHeightLabel || (manualHeight ? `${manualHeight}p` : "Manual")
      : currentHeightLabel
        ? `Auto · ${currentHeightLabel}`
        : "Auto";

  const subtitlesValue = !subtitleEnabled ? "Off" : currentSubtitle?.language || "On";
  const audioValue = currentAudioLabel || "Original";

  const autoOn = autoLevel !== false;
  const autoSummary =
    autoOn && currentHeight != null
      ? `Now ${qualities.find((q) => q.height === currentHeight)?.label || `${currentHeight}p`} · adjusts with your connection`
      : "Adjusts with your connection";

  const onAutoToggle = () => {
    if (autoOn) {
      const q = qualities.find((item) => item.height === currentHeight) || qualities[0];
      if (q) pickQuality(q.uri, q.height, { external: q.external });
    } else {
      pickAuto();
    }
    poke();
  };

  const sizeIndex = [0, 1, 2, 3].includes(subtitleSize)
    ? subtitleSize
    : [0.8, 1, 1.3, 1.7].indexOf(subtitleSize) >= 0
    ? [0.8, 1, 1.3, 1.7].indexOf(subtitleSize)
    : 1;

  const episodeRows = Array.isArray(episodes) ? episodes : [];

  /* v4 tileOk: a settings tile exists only when its picker would actually
     offer something. Quality always shows (there is always a ladder); Source
     with more than one server; Audio with more than one listening option (the
     source's own tracks when a dub list exists, since its first row is
     "Original"). Subtitles always shows: the OpenSubtitles lookup is live and
     an empty list usually means "still searching", not "no subs" — v4's
     data-known track list doesn't translate (pinned by playerA11y's
     settings→subtitles-settings flow). */
  const audioOptionCount =
    Array.isArray(dubTracks) && dubTracks.length > 0
      ? Array.isArray(audioTrackList)
        ? audioTrackList.length
        : 0
      : Array.isArray(audioTracks)
        ? audioTracks.length
        : 0;
  const sourceOptionCount = Array.isArray(orderedSources) ? orderedSources.length : 0;
  const tiles = [
    <Tile
      key="quality"
      label="Quality"
      value={qualityValue}
      ariaLabel="Video Quality"
      onClick={() => setPanel("video")}
    />,
    sourceOptionCount > 1 ? (
      <Tile key="source" label="Source" value={serverValue} ariaLabel="Servers" onClick={() => setPanel("servers")} />
    ) : null,
    <Tile
      key="subs"
      label="Subtitles"
      value={subtitlesValue}
      ariaLabel="Subtitles settings"
      onClick={() => setPanel("subs")}
    />,
    audioOptionCount > 1 ? (
      <Tile key="audio" label="Audio" value={audioValue} ariaLabel="Audio track" onClick={() => setPanel("audio")} />
    ) : null,
  ].filter(Boolean);

  useEffect(() => {
    if (panel === "episodes") {
      const cur = document.querySelector(".np-menu .row.ep.cur, .sheet .row.ep.cur, .sheet [aria-current='true']");
      if (cur && typeof cur.scrollIntoView === "function") {
        cur.scrollIntoView({ block: "center", behavior: "smooth" });
      }
    }
  }, [panel]);

  if (panel === "settings") {
    return (
      <div className="np-root-body">
        <div className="np-tiles tiles">{tiles}</div>
        <button type="button" className="np-menu-row row" onClick={() => setPanel("playback")}>
          <span>Playback settings</span>
          <svg className="ic chv"><use href="#i-chev" /></svg>
        </button>
        <button type="button" className="np-menu-row row" onClick={() => setPanel("appearance")}>
          <span>Appearance settings</span>
          <svg className="ic chv"><use href="#i-chev" /></svg>
        </button>
        <button type="button" className="np-menu-row row" onClick={() => setPanel("captions")}>
          <span>Subtitle style</span>
          <svg className="ic chv"><use href="#i-chev" /></svg>
        </button>
        {cueBoundaries?.source === "dataset" ? (
          <p className="np-credit">
            Skip boundaries by{" "}
            <a href={SKIP_DATA_CREDIT.url} target="_blank" rel="noreferrer noopener">
              {SKIP_DATA_CREDIT.name}
            </a>{" "}
            (open data, ODbL).
          </p>
        ) : null}
      </div>
    );
  }

  if (panel === "servers") {
    return (
      <div className="np-list">
        {orderedSources.map((s) => {
          const isSelected =
            s.key === serverKey ||
            s.key === resolvedServerObj?.key ||
            (s.server && s.server === rawServer);
          return (
            <DialogRow
              key={s.key}
              selected={isSelected}
              onClick={() => pickServer(s.key)}
              title={s.label}
              sub={s.tag}
            />
          );
        })}
      </div>
    );
  }

  if (panel === "video") {
    return (
      <div className="np-pbody">
        {qualityNote ? <p className="np-note np-note-warn">{qualityNote}</p> : null}
        <div className="np-qlist">
          {qualities.map((q, i) => {
            const selected =
              autoLevel === false
                ? manualHeight != null
                  ? q.height === manualHeight
                  : q.uri === activeUri
                : false;
            return (
              <Pick
                key={`${q.uri}::${i}`}
                selected={selected}
                onClick={() => pickQuality(q.uri, q.height, { external: q.external })}
              >
                {q.label || `${q.height}p`}
              </Pick>
            );
          })}
        </div>
        <div className="np-hr hr" />
        <div className="np-qauto row">
          <span>Automatic quality</span>
          <button
            type="button"
            role="switch"
            className={["switch", autoOn ? "on" : ""].filter(Boolean).join(" ")}
            aria-label="Automatic quality"
            aria-checked={autoOn}
            onClick={onAutoToggle}
          >
            <i />
          </button>
        </div>
        <p className="np-note note">
          {autoSummary}
          {!autoOn ? (
            <>
              {" "}
              You can try{" "}
              <button type="button" className="np-link lnk" onClick={() => setPanel("servers")}>
                switching source
              </button>{" "}
              to get different quality options.
            </>
          ) : null}
        </p>
        {sourceVariants.length > 1 ? (
          <button type="button" className="np-menu-row np-menu-row-inset row" onClick={() => setPanel("sourcequality")}>
            <span>Source quality</span>
            <span className="np-menu-row-val">
              {sourceHeight ? `${sourceHeight}p` : "Auto"}
              <svg className="ic chv"><use href="#i-chev" /></svg>
            </span>
          </button>
        ) : null}
      </div>
    );
  }

  if (panel === "subs") {
    return (
      <div className="np-pbody">
        <Pick selected={!subtitleEnabled} onClick={() => selectSubtitle(null)}>
          Off
        </Pick>
        {isFetchingSubtitles ? (
          <p className="np-note">Searching OpenSubtitles…</p>
        ) : subtitleLanguages.length > 0 ? (
          subtitleLanguages.map((s) => (
            <Pick
              key={s.languageId || s.language}
              selected={
                subtitleEnabled &&
                s.languageId === currentSubtitle?.languageId &&
                s.language === currentSubtitle?.language
              }
              onClick={() => selectSubtitle(s)}
            >
              {s.language}
            </Pick>
          ))
        ) : (
          <p className="np-note">
            {!imdbId
              ? "No subtitles found for this title on OpenSubtitles (no IMDb id — title search also came up empty)."
              : "No subtitles found for this title on OpenSubtitles."}
          </p>
        )}
        {subtitleError ? (
          <p role="alert" className="np-note np-note-warn">
            {subtitleError}
          </p>
        ) : null}
      </div>
    );
  }

  if (panel === "audio") {
    return (
      <div className="np-list">
        {qualityNote ? (
          <p role="status" className="np-note np-note-warn">
            {qualityNote}
          </p>
        ) : null}
        {dubTracks.length > 0 ? (
          <>
            <DialogRow
              key="dub-original"
              selected={activeDub === 0}
              onClick={() => pickDub(0)}
              title={audioTrackList[0]?.label || "Original"}
              sub="This source's soundtrack"
            />
            {audioTrackList.slice(1).map((t) => {
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
          <>
            {originalLanguage ? (
              <p className="np-note note">
                Film's original language:{" "}
                {languageNameFromCode(originalLanguage) || (originalLanguage || "").toUpperCase() || "Unknown"}
              </p>
            ) : null}
            <DialogRow
              key="original"
              selected
              title={
                originalLanguage
                  ? `Original — ${languageNameFromCode(originalLanguage) || (originalLanguage || "").toUpperCase() || "Unknown"}`
                  : "Original"
              }
              sub="This source's soundtrack"
            />
          </>
        )}
      </div>
    );
  }

  if (panel === "playback") {
    return (
      <div className="np-pbody">
        <div className="np-lbl first">Playback speed</div>
        <Seg
          ariaLabel="Playback speed"
          value={playbackRate}
          onChange={(rate) => {
            onPickPlaybackRate(rate);
            poke();
          }}
          options={PLAYER_SPEEDS.map((rate) => ({
            value: rate,
            label: rate === 1 ? "1x" : `${rate}x`,
          }))}
        />

        <div className="np-lbl">Aspect ratio</div>
        {ASPECT_RATIOS.map((aspect, index) => (
          <Pick
            key={aspect.id}
            selected={aspectRatioIndex === index}
            onClick={() => {
              setAspectRatioIndex(index);
              poke();
            }}
          >
            {aspect.name}
          </Pick>
        ))}

        {showEpisodesButton ? (
          <div className="row" style={{ marginTop: "1em" }}>
            <span>Autoplay next episode</span>
            <button
              type="button"
              className="switch"
              role="switch"
              aria-checked={autoplayEnabled}
              aria-label="Autoplay next episode"
              onClick={onToggleAutoplay}
            />
          </div>
        ) : null}
      </div>
    );
  }

  if (panel === "appearance") {
    const accent = v4Appearance?.accent || "#8652bb";
    const iconSize = v4Appearance?.iconSize || 1;
    return (
      <div className="np-pbody">
        <div className="np-lbl first">Control icon size</div>
        {/* A former `.np-vol-slider` here inherited the volume control's
            collapsed state (width 0, opacity 0) and was unusable. A plain v4
            `.range` is what the pane wants. */}
        <input
          type="range"
          className="range"
          min={0.5}
          max={2.2}
          step={0.1}
          value={iconSize}
          aria-label="Control icon size"
          style={{ "--p": `${((iconSize - 0.5) / 1.7) * 100}%` }}
          onChange={(e) => {
            v4Appearance?.setIconSize?.(parseFloat(e.target.value));
            poke();
          }}
        />
        <div className="marks" aria-hidden="true">
          <span>Small</span>
          <b>{iconSize.toFixed(1)}x</b>
          <span>Large</span>
        </div>

        <div className="np-lbl">Theme color</div>
        {/* v4 draws the presets as `.th` radio swatches — colour dot plus name.
            They were colour-only pills with no label and no radio semantics. */}
        <div className="themes" role="radiogroup" aria-label="Theme color">
          {PLAYER_V4_THEMES.map(([name, hex]) => {
            const isSel = accent.toLowerCase() === hex.toLowerCase();
            return (
              <button
                key={hex}
                type="button"
                role="radio"
                className="th"
                aria-checked={isSel}
                aria-label={`Theme ${name}`}
                onClick={() => {
                  v4Appearance?.setAccent?.(hex);
                  poke();
                }}
              >
                <i style={{ background: hex }} />
                {name}
              </button>
            );
          })}
        </div>

        <div className="np-lbl">Custom color</div>
        <div className="custom">
          <input
            type="color"
            id="cp"
            value={accent}
            aria-label="Pick a color"
            onChange={(e) => {
              v4Appearance?.setAccent?.(e.target.value);
              poke();
            }}
          />
          <input
            type="text"
            id="hex"
            value={accent}
            maxLength={7}
            spellCheck={false}
            aria-label="Hex color"
            onChange={(e) => {
              const val = e.target.value;
              if (/^#[0-9a-fA-F]{0,6}$/.test(val)) {
                v4Appearance?.setAccent?.(val);
                poke();
              }
            }}
          />
        </div>
      </div>
    );
  }

  if (panel === "captions") {
    const subColor = v4Appearance?.subColor || "#ffffff";
    const subBgStyle = v4Appearance?.subBgStyle || "shadow";
    const czMap = [0.8, 1, 1.3, 1.7];
    const activeCz = czMap[sizeIndex] || 1;

    return (
      <div className="np-pbody np-captions-body">
        {/* Live preview matching player-v4.html */}
        <div
          className="cap pv"
          data-cb={subBgStyle}
          style={{
            "--cz": activeCz,
            "--cc": subColor,
            color: subColor,
          }}
        >
          <div className="cl" style={{ color: subColor }}>Subtitle preview text</div>
        </div>

        <div className="lbl np-lbl first">Size</div>
        <div className="seg c4" role="radiogroup" aria-label="Subtitle size">
          {[["Small", 0], ["Medium", 1], ["Large", 2], ["XL", 3]].map(([name, val]) => (
            <button
              key={val}
              type="button"
              role="radio"
              aria-checked={sizeIndex === val}
              onClick={() => {
                setSubtitleSize(val);
                poke();
              }}
            >
              {name}
            </button>
          ))}
        </div>

        <div className="lbl np-lbl">Background</div>
        <div className="seg c3" role="radiogroup" aria-label="Subtitle background">
          {[["Shadow", "shadow"], ["Box", "box"], ["Outline", "outline"]].map(([name, val]) => (
            <button
              key={val}
              type="button"
              role="radio"
              aria-checked={subBgStyle === val}
              onClick={() => {
                v4Appearance?.setSubBgStyle?.(val);
                poke();
              }}
            >
              {name}
            </button>
          ))}
        </div>

        <div className="lbl np-lbl">Color</div>
        <div className="seg c4" role="radiogroup" aria-label="Subtitle color">
          {[["White", "#ffffff"], ["Yellow", "#ffe14d"], ["Cyan", "#5ee7ff"], ["Green", "#7dff8a"]].map(([name, val]) => {
            const isSel = subColor.toLowerCase() === val.toLowerCase();
            return (
              <button
                key={val}
                type="button"
                role="radio"
                aria-checked={isSel}
                onClick={() => {
                  v4Appearance?.setSubColor?.(val);
                  poke();
                }}
              >
                <i className="dotc" style={{ background: val }} />
                {name}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  if (panel === "sourcequality") {
    return (
      <div className="np-list">
        <p className="np-note">
          The provider's raw source file resolution. Different from Video Quality, which picks a rung of the stream we
          deliver.
        </p>
        <Pick selected={!sourceHeight} onClick={() => pickSourceQuality(0)}>
          Auto
        </Pick>
        {sourceVariants.map((v) => (
          <Pick key={v.height} selected={sourceHeight === v.height} onClick={() => pickSourceQuality(v.height)}>
            {v.label || `${v.height}p`}
          </Pick>
        ))}
      </div>
    );
  }

  if (panel === "episodes") {
    // v4 epRow: watched episodes get a check icon, partially-watched ones a
    // bigger circular progress indicator. Shows progress for ALL episodes that
    // have been started — including the current episode and any previously
    // watched episode, so switching between episodes always shows full progress.
    const watchedSet = new Set(
      Array.isArray(watchedEpisodes?.[season])
        ? watchedEpisodes[season]
        : Array.isArray(watchedEpisodes?.[String(season)])
          ? watchedEpisodes[String(season)]
          : [],
    );
    const resume = resumePoint || null;
    return (
      <div className="np-list np-list-episodes">
        {episodeRows.length === 0 ? (
          <p className="np-note">No episodes listed for this season.</p>
        ) : (
          episodeRows.map((ep) => {
            const current = ep.number === episode;
            const aired = isEpAired(ep);
            const done = watchedSet.has(ep.number);
            let progress = 0;
            // Current playing episode: use live currentTime.
            if (current && safeDuration > 0) {
              progress = Math.min(1, currentTime / safeDuration);
            }
            // Any episode with a saved resume point (including previously-watched): show its progress.
            if (
              !done &&
              resume &&
              resume.season === season &&
              resume.episode === ep.number &&
              resume.timestamp > 0
            ) {
              const mins = Number(ep.durationMins) || 0;
              if (mins > 0) progress = Math.min(1, resume.timestamp / (mins * 60));
            }
            // Circular progress rotation: 0% = 0deg, 100% = 270deg (leaves 25% gap).
            const rot = progress > 0.01 ? progress * 270 : 0;
            return (
              <button
                key={ep.number}
                type="button"
                className={["np-ep", "np-episode-card", "row", "ep", current ? "cur active" : "", done ? "watched" : "", progress > 0.01 ? "has-progress" : ""].filter(Boolean).join(" ")}
                aria-current={current ? "true" : undefined}
                aria-disabled={aired ? undefined : "true"}
                onClick={() => {
                  if (!aired) return;
                  setResumeOffer(null);
                  setPanel(null);
                  setBuffering(true);
                  chooseEpisode(ep.number);
                }}
              >
                <span className="np-ep-badge eb">E{ep.number}</span>
                <span className="np-ep-main">
                  <span className="np-ep-title">{ep.title || `Episode ${ep.number}`}</span>
                  {!aired ? <span className="np-ep-sub">Airs {formatAirsDate(ep.airDate)}</span> : null}
                </span>
                {done ? (
                  <svg className="ic wd" role="img" aria-label="Watched">
                    <use href="#i-check" />
                  </svg>
                ) : progress > 0.01 && progress < 0.95 ? (
                  <span
                    className="epp"
                    role="progressbar"
                    aria-label="Watch progress"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(progress * 100)}
                    style={{ "--epp-rot": `${rot}deg` }}
                  >
                    <i />
                  </span>
                ) : null}
                {current ? <span className="np-sr-only">Now playing</span> : null}
              </button>
            );
          })
        )}
      </div>
    );
  }

  return null;
}
