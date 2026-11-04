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
import {
  DialogRow,
  IconAudio,
  IconChevronRight,
  IconMenuCheck,
  IconServers,
} from "../chrome";
import { PLAYER_V4_THEMES } from "../chrome/theme";
import { ASPECT_RATIOS, PLAYER_SPEEDS } from "../../../constants/playerUi";
import { SKIP_DATA_CREDIT } from "../../../api/skipBoundarySource";
import { languageNameFromCode } from "../../../utils/audioLabels";
import { AUTO_SOURCE, DEFAULT_SOURCE_KEY, sourceLabel } from "../../../constants/sources";
import { qualityHdTag } from "../nativePlayerHelpers";
import { formatAirsDate, isEpAired } from "../../../utils/titleDetails";

const SUBTITLE_SIZES = ["Small", "Medium", "Large"];
const SUBTITLE_BACKGROUNDS = ["None", "Shadow", "Box"];

function Tile({ label, value, ariaLabel, onClick }) {
  return (
    <button type="button" className="np-tile tile" aria-label={ariaLabel} onClick={onClick}>
      <span className="np-tile-k">{label}</span>
      <span className="np-tile-v">{value}</span>
    </button>
  );
}

function Pick({ selected, onClick, children, disabled }) {
  return (
    <button
      type="button"
      className={["np-pick", "row", selected ? "sel" : ""].filter(Boolean).join(" ")}
      aria-pressed={selected ? true : undefined}
      disabled={disabled}
      onClick={disabled ? undefined : onClick}
    >
      <span className="np-pick-name">{children}</span>
      <IconMenuCheck size={30} />
    </button>
  );
}

function Seg({ options, value, onChange, ariaLabel }) {
  const index = options.findIndex((o) => o.value === value);
  return (
    <div
      className={["np-seg", "seg", `c${options.length}`].join(" ")}
      role="group"
      aria-label={ariaLabel}
      style={{ "--n": options.length, "--i": Math.max(0, index) }}
    >
      <span className="np-seg-thumb" aria-hidden="true" />
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className={["np-seg-btn", o.value === value ? "on" : ""].filter(Boolean).join(" ")}
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
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
  setBuffering,
  setResumeOffer,
  // v4 Appearance bundle
  v4Appearance,
}) {
  const committedServer =
    activeSourceKey && activeSourceKey !== AUTO_SOURCE.key ? activeSourceKey : null;
  const requested =
    requestedServer && requestedServer !== AUTO_SOURCE.key ? requestedServer : null;
  const serverKey = requested || committedServer || DEFAULT_SOURCE_KEY;
  const serverValue = sourceLabel(serverKey, "Server 1");

  const qualityValue =
    autoLevel === false
      ? qualities.find((q) => q.height === manualHeight)?.label ||
        (currentHeight ? `${currentHeight}p` : "Manual")
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

  const sizeIndex = [0, 1, 2, 3].includes(subtitleSize) ? subtitleSize : 1;
  const bgIndex = [0, 1, 2].includes(subtitleBg) ? subtitleBg : 1;

  const episodeRows = Array.isArray(episodes) ? episodes : [];

  if (panel === "settings") {
    return (
      <div className="np-root-body">
        <div className="np-tiles tiles">
          <Tile label="Quality" value={qualityValue} ariaLabel="Video Quality" onClick={() => setPanel("video")} />
          <Tile label="Source" value={serverValue} ariaLabel="Servers" onClick={() => setPanel("servers")} />
          <Tile
            label="Subtitles"
            value={subtitlesValue}
            ariaLabel="Subtitles settings"
            onClick={() => setPanel("subs")}
          />
          <Tile label="Audio" value={audioValue} ariaLabel="Audio track" onClick={() => setPanel("audio")} />
        </div>
        <button type="button" className="np-menu-row row" onClick={() => setPanel("playback")}>
          <span>Playback settings</span>
          <IconChevronRight size={28} />
        </button>
        <button type="button" className="np-menu-row row" onClick={() => setPanel("appearance")}>
          <span>Appearance Settings</span>
          <IconChevronRight size={28} />
        </button>
        <button type="button" className="np-menu-row row" onClick={() => setPanel("captions")}>
          <span>Subtitle style</span>
          <IconChevronRight size={28} />
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
        {orderedSources.map((s) => (
          <DialogRow
            key={s.key}
            selected={serverKey === s.key}
            onClick={() => pickServer(s.key)}
            title={s.label}
            sub={s.tag}
            icon={<IconServers size={22} />}
          />
        ))}
      </div>
    );
  }

  if (panel === "video") {
    return (
      <div className="np-pbody">
        {qualityNote ? <p className="np-note np-note-warn">{qualityNote}</p> : null}
        {qualities.map((q, i) => {
          const selected =
            autoLevel === false
              ? manualHeight != null
                ? q.height === manualHeight
                : q.uri === activeUri
              : autoLevel === true && isMasterMode
                ? currentHeight != null && q.height === currentHeight
                : false;
          return (
            <Pick
              key={`${q.uri}::${i}`}
              selected={selected}
              onClick={() => pickQuality(q.uri, q.height, { external: q.external })}
            >
              {`${q.label || `${q.height}p`}${qualityHdTag(q) ? " HD" : ""}`}
            </Pick>
          );
        })}
        <div className="np-hr" />
        <div className="np-qauto">
          <span>Automatic quality</span>
          <button
            type="button"
            className={["np-tog", "np-tog-acc", autoOn ? "on" : ""].filter(Boolean).join(" ")}
            aria-label="Automatic quality"
            aria-pressed={autoOn}
            onClick={onAutoToggle}
          >
            <i />
          </button>
        </div>
        <p className="np-note">
          {autoSummary}
          {!autoOn ? (
            <>
              {" "}
              You can try{" "}
              <button type="button" className="np-link" onClick={() => setPanel("servers")}>
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
              <IconChevronRight size={22} />
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
              icon={<IconAudio size={22} />}
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
                  icon={<IconAudio size={22} />}
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
                icon={<IconAudio size={22} />}
              />
            );
          })
        ) : (
          <>
            {originalLanguage ? (
              <p className="np-note">
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
              icon={<IconAudio size={22} />}
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
          <div className="np-auto">
            <span>Autoplay next episode</span>
            <button
              type="button"
              className={["np-tog", autoplayEnabled ? "on" : ""].filter(Boolean).join(" ")}
              role="switch"
              aria-checked={autoplayEnabled}
              aria-label="Autoplay next episode"
              onClick={onToggleAutoplay}
            >
              <i />
            </button>
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
        {/* `.np-vol-slider` was on this input, so it inherited the volume
            control's collapsed state (width 0, opacity 0) and the slider was
            invisible and unusable. A plain v4 `.range` is what the pane wants. */}
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

        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <input
            type="color"
            value={accent}
            aria-label="Custom theme color"
            onChange={(e) => {
              v4Appearance?.setAccent?.(e.target.value);
              poke();
            }}
            style={{
              width: 38,
              height: 38,
              padding: 0,
              borderRadius: "0.5em",
              border: "1px solid rgba(255,255,255,0.2)",
              background: "transparent",
              cursor: "pointer",
            }}
          />
          <input
            type="text"
            value={accent}
            aria-label="Theme color hex code"
            onChange={(e) => {
              const val = e.target.value;
              if (/^#[0-9a-fA-F]{0,6}$/.test(val)) {
                v4Appearance?.setAccent?.(val);
                poke();
              }
            }}
            style={{
              flex: 1,
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.15)",
              borderRadius: "0.5em",
              padding: "8px 12px",
              color: "#fff",
              fontFamily: "monospace",
              fontSize: 14,
            }}
          />
        </div>

        <div className="np-lbl">Subtitle size</div>
        <Seg
          ariaLabel="Subtitle size"
          value={sizeIndex}
          onChange={(i) => {
            setSubtitleSize(i);
            poke();
          }}
          options={SUBTITLE_SIZES.map((name, i) => ({ value: i, label: name }))}
        />

        <div className="np-lbl">Subtitle background</div>
        <Seg
          ariaLabel="Subtitle background"
          value={bgIndex}
          onChange={(i) => {
            setSubtitleBg(i);
            poke();
          }}
          options={SUBTITLE_BACKGROUNDS.map((name, i) => ({ value: i, label: name }))}
        />

        <button
          type="button"
          className="np-menu-row row"
          onClick={() => setPanel("captions")}
          style={{ marginTop: 14 }}
        >
          <span>Advanced Subtitle Style</span>
          <IconChevronRight size={22} />
        </button>
      </div>
    );
  }

  if (panel === "captions") {
    const subColor = v4Appearance?.subColor || "#ffffff";
    const subBgStyle = v4Appearance?.subBgStyle || "shadow";
    const SUB_COLORS = [
      { name: "White", value: "#ffffff" },
      { name: "Yellow", value: "#ffe600" },
      { name: "Cyan", value: "#00e5ff" },
      { name: "Green", value: "#69f0ae" },
    ];
    const SUB_STYLES = [
      { name: "Shadow", value: "shadow" },
      { name: "Box", value: "box" },
      { name: "Outline", value: "outline" },
    ];
    const SUB_SIZE_OPTIONS = [
      { name: "Small", value: 0 },
      { name: "Medium", value: 1 },
      { name: "Large", value: 2 },
      { name: "XL", value: 3 },
    ];

    return (
      <div className="np-pbody">
        {/* Live preview */}
        <div
          className="capw pv"
          style={{
            position: "relative",
            minHeight: 70,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0,0,0,0.6)",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: "0.8em",
            marginBottom: 16,
            padding: "12px 16px",
          }}
        >
          <div
            className="cap pv"
            style={{
              color: subColor,
              fontSize: sizeIndex === 0 ? "0.95em" : sizeIndex === 2 ? "1.35em" : sizeIndex === 3 ? "1.65em" : "1.15em",
              textShadow: subBgStyle === "shadow" ? "0 2px 6px #000, 0 0 2px #000" : subBgStyle === "outline" ? "0 1px 3px rgba(0,0,0,0.8)" : "none",
              background: subBgStyle === "box" ? "rgba(0,0,0,0.8)" : "transparent",
              padding: subBgStyle === "box" ? "4px 10px" : "0",
              borderRadius: "0.4em",
              WebkitTextStroke: subBgStyle === "outline" ? "1px #000" : "none",
              fontWeight: 600,
              textAlign: "center",
            }}
          >
            Preview: This is what subtitles look like.
          </div>
        </div>

        <div className="np-lbl first">Size</div>
        <Seg
          ariaLabel="Subtitle size"
          value={sizeIndex}
          onChange={(i) => {
            setSubtitleSize(i);
            poke();
          }}
          options={SUB_SIZE_OPTIONS.map((o) => ({ value: o.value, label: o.name }))}
        />

        <div className="np-lbl">Background style</div>
        <Seg
          ariaLabel="Subtitle style"
          value={subBgStyle}
          onChange={(val) => {
            v4Appearance?.setSubBgStyle?.(val);
            poke();
          }}
          options={SUB_STYLES.map((s) => ({ value: s.value, label: s.name }))}
        />

        <div className="np-lbl">Text color</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginTop: 6 }}>
          {SUB_COLORS.map((c) => {
            const isSel = subColor.toLowerCase() === c.value.toLowerCase();
            return (
              <button
                key={c.value}
                type="button"
                className={["np-seg-btn", isSel ? "on" : ""].filter(Boolean).join(" ")}
                onClick={() => {
                  v4Appearance?.setSubColor?.(c.value);
                  poke();
                }}
                style={{
                  padding: "8px 4px",
                  borderRadius: "0.5em",
                  border: isSel ? `2px solid ${c.value}` : "1px solid rgba(255,255,255,0.15)",
                  color: c.value,
                  fontWeight: 700,
                  fontSize: 13,
                  background: isSel ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.04)",
                  cursor: "pointer",
                }}
              >
                {c.name}
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
    return (
      <div className="np-list np-list-episodes">
        {episodeRows.length === 0 ? (
          <p className="np-note">No episodes listed for this season.</p>
        ) : (
          episodeRows.map((ep) => {
            const current = ep.number === episode;
            const aired = isEpAired(ep);
            return (
              <button
                key={ep.number}
                type="button"
                className={["np-ep", "np-episode-card", "row", "ep", current ? "cur active" : ""].filter(Boolean).join(" ")}
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
