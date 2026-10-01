import { useCallback, useEffect, useMemo, useRef } from "react";
import { ASPECT_RATIOS, PLAYER_SPEEDS } from "../../../constants/playerUi";
import { panelDefinition, panelDomId } from "./sheetPanels";
import { isTrapTab, nextFocusIndex, tabbables } from "./focusTrap";
import { isRadioKey, nextRadioIndex, radioTabIndex, radioTabStopIndex } from "./radioGroup";
import { sortTracks, trackBadge, trackBadgeLabel, trackKey } from "./subtitleTracks";
import { formatRate } from "./rate";
import { audioOptions } from "./audioTracks";
import { logWarn } from "../../../utils/debugLogger";

const SHEET_SCOPE = "player.v2.sheet";

/**
 * The settings sheet (task.md 3.24).
 *
 * ── What this item is actually fixing ─────────────────────────────────────────
 * The legacy opens each panel as its own overlay, and they do not know about each
 * other. Open Episodes, then tap Subtitles, and both are on screen: the episode
 * list keeps its own scrim, the subtitle pane keeps its own, and the video is
 * behind two dimmed layers. Whichever opened last paints on top, so the older one
 * is not merely redundant — it is unreachable, because its rows are under the
 * newer scrim and a click lands on the newer backdrop, which dismisses THAT one.
 * The viewer is left tapping a panel that appears to do nothing.
 *
 * The fix is not "draw them better", it is "there is only ever one". So the panel
 * is chosen by a single id in the shell and this component renders exactly one
 * child. Stacking is unrepresentable rather than merely avoided.
 *
 * ── What is deliberately NOT here ──────────────────────────────────────────────
 * Nothing from 3.25's own list is missing: the backdrop, the trap and Escape are all
 * below. 3.29's subtitle metadata (SDH badge, forced marker, ordering) IS here, and it
 * arrives as real fields: `subtitleFetcher` now carries `hearingImpaired` and `forced`
 * through from `SubHearingImpaired`/`SubForced` and dedupes on the (language, variant)
 * pair rather than on the language alone. No badge is ever parsed out of a language
 * NAME — that would be a guess wearing a fact's clothes.
 */
export default function SettingsSheet({
  panelId,
  onClose,
  /* Everything the panels could possibly need, in one object rather than eleven
   * props. Six panels with three rows each is thirty props, and a thirty-prop
   * signature is a signature nobody keeps correct. */
  panels = {},
}) {
  const definition = panelDefinition(panelId);
  const sheetRef = useRef(null);
  const open = Boolean(definition);

  /* Where focus was before the sheet opened, so it can go back.
   *
   * Not a ref-read-inside-an-effect: the opener has to be captured at OPEN time,
   * before focus has moved into the sheet. A ref consulted on close would find
   * whatever has focus now — which is the sheet's own close button, on its way out
   * of the DOM — and restoring focus to a disconnected node silently does nothing,
   * dropping the viewer at the top of the document. */
  const openerRef = useRef(null);
  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (open && !wasOpenRef.current) {
      /* Captured before the move, so it is the transport button and not something
       * inside the sheet. */
      openerRef.current = sheetRef.current?.ownerDocument?.activeElement ?? null;
    }

    if (!open) {
      /* Closing. Only on a real open→closed transition: the unmount path also runs
       * effects, and restoring focus on a sheet that never opened would steal it
       * from whatever the viewer is actually using. */
      if (wasOpenRef.current) {
        const opener = openerRef.current;
        openerRef.current = null;
        if (opener && opener.isConnected && typeof opener.focus === "function") {
          opener.focus();
        }
      }
      wasOpenRef.current = false;
      return;
    }

    wasOpenRef.current = true;
    /* Move focus INTO the sheet on open, rather than relying on the opener's own
     * focus staying put. A dialog the viewer cannot tell has focus is a dialog
     * their next Tab starts leaving. The close button is the target rather than
     * the first row: it is the one control guaranteed to exist in every panel, so
     * focus never lands on an element a later render removes. */
    const first = tabbables(sheetRef.current)[0];
    first?.focus?.();
  }, [open, panelId]);

  /* A panel id the sheet cannot render means the shell and this file disagree
   * about the panel list. Nothing is rendered (the `definition` guard below), and
   * the disagreement is logged rather than left to be noticed as an empty sheet. */
  useEffect(() => {
    if (panelId && !definition) {
      logWarn(SHEET_SCOPE, "sheet opened with an unknown panel id", { panelId });
    }
  }, [panelId, definition]);

  /* ── Escape closes the SHEET, and only then the player (task.md 3.25) ──────
   *
   * Two orderings are possible and only one is usable. Close the player first and
   * the sheet goes with it, so a viewer who opened Episodes to change the aspect
   * ratio and pressed Escape has lost their place — and the full player is gone
   * too, so there is no "never mind" left. Close the sheet first and Escape is a
   * single undo of the last thing the viewer did, which is what every other Escape
   * means everywhere else on the platform.
   *
   * `stopPropagation`, not `preventDefault`: the shell's own Escape handler is a
   * separate listener, and the whole ordering depends on this handler not letting
   * the event through. `preventDefault` alone would suppress the browser's default
   * while still calling every other handler — both layers would close at once.
   *
   * Capture phase, so this runs BEFORE anything the panel or a row might handle.
   * A panel that wants Escape for itself has to say so explicitly, and none do.
   */
  const handleKeyDown = useCallback(
    (event) => {
      if (event.key !== "Escape") return;
      /* `stopPropagation` here, before `onClose`: if `onClose` unmounts this sheet
       * synchronously, the rest of the handler would still run against a component
       * that is on its way out. */
      event.stopPropagation();
      onClose?.();
    },
    [onClose],
  );

  /* ── The trap (task.md 3.25) ─────────────────────────────────────────────────
   *
   * `aria-modal` is a CLAIM to assistive technology and changes nothing about the
   * browser's tab sequence. Without this handler, Tab on the last row moves focus
   * to the page behind the sheet, so a screen reader announces page content while
   * the dialog claims the screen is unavailable — and then the next Tab is handled
   * from outside the trap, which is exactly the state the trap exists to prevent.
   */
  const handleTab = useCallback((event) => {
    if (!isTrapTab(event)) return;
    const list = tabbables(sheetRef.current);
    const index = nextFocusIndex(list.length, list.indexOf(event.target), {
      backwards: Boolean(event.shiftKey),
    });
    /* Nothing to focus (an empty panel): leave the key alone rather than trapping
     * the viewer on a key that cannot move. `preventDefault` here would silently
     * swallow every Tab in an empty sheet. */
    if (index === null) return;
    event.preventDefault();
    list[index]?.focus?.();
  }, []);

  if (!definition) return null;

  const titleId = `pv2-sheet-title-${definition.id}`;

  return (
    <>
      {/* The backdrop. A SIBLING of the sheet, not a parent: if it wrapped the
       * sheet, the press that closes it would bubble from the panel too, so every
       * row click would close the sheet the click landed in. Separate elements mean
       * "the press was on the scrim" is a DOM fact, not a coordinate comparison. */}
      <div className="pv2-sheet__backdrop" onClick={onClose} aria-hidden="true" />
      <div
        className="pv2-sheet"
        /* 3.27. The element the opener's `aria-controls` points at, and derived from
         * `sheetPanels` rather than written out here — the opener is rendered by
         * `TransportBar`, which does not import this file, so both sides have to
         * compute the same string from the panel id or the reference resolves to
         * nothing while both halves of their own tests pass.
         *
         * On the DIALOG rather than on `.pv2-sheet__body`: the opener promises a
         * dialog (`aria-haspopup="dialog"`), so the thing it controls is the dialog,
         * heading and close button included. Pointing at the body instead would send
         * an assistive-tech jump to the first row and skip the title that names which
         * panel just opened. */
        /* `?? undefined`, and not a fallback string: `definition` is truthy here, so
         * `panelDomId` cannot return null, and if it ever did then `id="null"` would be
         * an id that resolves to nothing — a dangling reference that looks fine in
         * every attribute assertion. `undefined` omits the attribute entirely, which
         * fails the resolution test instead of quietly passing it. */
        id={panelDomId(definition.id) ?? undefined}
        data-sheet-panel={definition.id}
        ref={sheetRef}
        /* `aria-modal` plus `aria-labelledby` to the visible heading, so the dialog
         * announces "Subtitles, dialog" rather than an unlabelled "dialog" — an
         * unnamed modal gives a screen-reader user nothing to confirm they opened
         * the right thing. */
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        /* Escape on the sheet itself, not on `document`: a listener on the document
         * would fire for presses anywhere on the page, including behind the sheet. */
        onKeyDown={handleKeyDown}
        onKeyDownCapture={handleTab}
      >
        <div className="pv2-sheet__head">
          <h2 className="pv2-sheet__title" id={titleId}>
            {definition.title}
          </h2>
          <button
            type="button"
            className="pv2-sheet__close"
            onClick={onClose}
            aria-label={`Close ${definition.title}`}
          >
            <span aria-hidden="true">&times;</span>
          </button>
        </div>
        <div className="pv2-sheet__body">
          <SheetPanel id={definition.id} panels={panels} />
        </div>
      </div>
    </>
  );
}

/**
 * The one panel body. A `switch` on a closed set rather than six components
 * registered somewhere else: the compiler checks these ids against the literals,
 * so a renamed panel is a type error here instead of a blank pane in production.
 */
function SheetPanel({ id, panels }) {
  switch (id) {
    case "captions":
      return <CaptionsPanel {...panels} />;
    case "audio":
      return <AudioPanel {...panels} />;
    case "settings":
      return <AspectPanel {...panels} />;
    case "speed":
      return <SpeedPanel {...panels} />;
    case "volume":
      return <VolumePanel {...panels} />;
    case "episodes":
      return <EpisodesPanel {...panels} />;
    case "users":
      return <UsersPanel {...panels} />;
    case "server":
      return <ServerPanel {...panels} />;
    default:
      return null;
  }
}

/**
 * One selectable row — a `role="radio"` in a single-select group (task.md 3.26).
 *
 * ── Why `role="radio"` and not `aria-pressed` ──────────────────────────────────
 * `aria-pressed` says "this is a toggle, and it is currently on". Subtitles, aspect,
 * speed, volume and the current episode are none of them toggles: they are one choice
 * out of several, where choosing the already-chosen option is not a meaningful act.
 * Under `aria-pressed`, a screen reader announces "Off, toggle button, not pressed"
 * for the subtitle row the viewer just turned subtitles off with — the state and the
 * action are described in different vocabularies, and "not pressed" for a row that is
 * in fact the current selection is a lie. With `aria-checked`, the same row reads
 * "Off, radio button, checked, 1 of 6", which also hands over the position in the set.
 *
 * ── `aria-checked` is always present, never omitted ─────────────────────────────
 * `aria-checked={selected ? "true" : undefined}` is the tempting version and it is
 * wrong: an attribute that is absent is not the same as `aria-checked="false"`, and
 * on a role whose checked state is REQUIRED an absent attribute leaves the option's
 * state undefined. Most assistive tech then guesses from the visual highlight, which
 * is precisely the coupling this is meant to remove. So it is a real boolean on
 * every option, selected or not.
 *
 * `disabled` rather than hiding a row that cannot act: an absent row and an inert row
 * read identically to a sighted viewer, and the viewer cannot tell "this is
 * unavailable" from "this does not exist yet".
 *
 * Still a real `<button>`, because the role is a claim about semantics and the element
 * is what gives Space/Enter activation, focus and the disabled behaviour for free.
 */
function SheetRow({ selected, onClick, title, sub, badge, disabled, tone, tabIndex, ref }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected ? "true" : "false"}
      className="pv2-sheet__row"
      data-selected={selected ? "true" : "false"}
      data-tone={tone}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      ref={ref}
      /* The roving tabindex from 3.26: exactly one option in the group is `0`, the
       * rest `-1`. Explicit `-1` rather than omitted, because a native button defaults
       * to `0` and omitting the attribute puts EVERY option back in the tab order,
       * which is the change appearing to do nothing at all. */
      tabIndex={tabIndex}
    >
      <span className="pv2-sheet__row-title">{title}</span>
      {/* 3.29. The short chip. `aria-hidden` because the expanded phrase is already in
       * the row's accessible name via `sub` — without this, a screen reader announces
       * "English, SDH, SDH hearing impaired" and the redundancy is read as a mistake. */}
      {badge ? (
        <span className="pv2-sheet__badge" data-variant={badge.toLowerCase()} aria-hidden="true">
          {badge}
        </span>
      ) : null}
      {sub ? <span className="pv2-sheet__row-sub">{sub}</span> : null}
    </button>
  );
}

/**
 * A single-select group (task.md 3.26).
 *
 * ── What `role="radiogroup"` buys, concretely ──────────────────────────────────
 * One Tab stop for the whole group instead of one per option. Six subtitle languages
 * as six stops means a keyboard viewer tabs six times to get past a list they may not
 * have wanted to change; the arrows then move within it, which is the point.
 *
 * ── ARROWS MOVE THE SELECTION, not just the focus ──────────────────────────────
 * That is what a radiogroup promises, and it is also the cheapest thing to get wrong:
 * moving focus alone is `role="listbox"` behaviour, and a screen-reader user who
 * presses ArrowRight under a radiogroup role hears nothing change and concludes the
 * control is broken. `SegmentControl.jsx` already does this correctly, so there is
 * precedent and no argument to have.
 *
 * ── RTL ────────────────────────────────────────────────────────────────────────
 * ArrowRight means "the next option" and ArrowLeft "the previous one" in BOTH writing
 * directions. It is not "right on the screen": for an Arabic or Hebrew viewer the
 * visual order of the group is mirrored, so a physical ArrowRight moves toward the
 * previous option. Keying off the key name rather than the layout is what the ARIA
 * pattern specifies, and it is also why the layout and the key never disagree — the
 * same rule holds whether the sheet is mirrored or not.
 *
 * ── Keys the group does NOT claim ───────────────────────────────────────────────
 * Space and Enter activate, and they arrive as ordinary click events on a real
 * button, so there is nothing to handle and duplicating it would double-fire the
 * selection. Tab belongs to 3.25's trap, and it must reach it — this handler returns
 * early on `isRadioKey` being false rather than calling `preventDefault()` on
 * everything, so the trap below still gets its turn. A group that swallowed Tab would
 * strand the viewer inside it with no way out.
 *
 * ── Why focus moves even when the selection does not change ────────────────────
 * Wrapping from the last option to the first has to land somewhere, and stopping on
 * the current option instead would make the ring feel broken. `nextRadioIndex`
 * decides it; this only has to honour the result.
 */
function SheetRadioGroup({ label, options, onSelect, note }) {
  const groupRef = useRef(null);
  const rowRefs = useRef([]);

  const enabled = useCallback(
    (index) => options[index] ? !options[index].disabled : false,
    [options],
  );

  const checkedIndex = options.findIndex((option) => option.selected);
  const tabStopIndex = radioTabStopIndex(options.length, { checkedIndex, enabled });

  /* Arrow keys move focus AND selection together.
   *
   * The two are moved in one handler rather than by watching `selected` change,
   * because a selection change can arrive from somewhere that is not the keyboard — a
   * restored preference, a track that finishes loading. Keying off the render would
   * then focus a row nobody asked to focus. */
  const handleKeyDown = useCallback(
    (event) => {
      if (!isRadioKey(event.key)) return;
      /* The key is only claimed once there is somewhere to send it. No usable option
       * means the panel is entirely inert — aspect ratio with nothing to choose from —
       * and swallowing the keystroke there would leave the viewer pressing ArrowRight
       * against a control that does nothing, with the page no longer scrolling either. */
      const from = rowRefs.current.findIndex((node) => node === event.target || node?.contains?.(event.target));
      const next = nextRadioIndex(options.length, from, event.key, { enabled });
      if (next === null) return;
      event.preventDefault();
      /* Focus first, then select. Selecting can re-render the list (a subtitle
       * download resolving, a panel swap) and unmount the node we are about to focus;
       * doing it in this order means the caret lands on a node that still exists. */
      rowRefs.current[next]?.focus?.();
      onSelect?.(options[next], next);
    },
    [enabled, onSelect, options],
  );

  return (
    <div
      ref={groupRef}
      role="radiogroup"
      aria-label={label}
      className="pv2-sheet__group"
      onKeyDown={handleKeyDown}
    >
      {options.map((option, index) => (
        <SheetRow
          key={option.key}
          ref={(node) => {
            rowRefs.current[index] = node;
          }}
          selected={Boolean(option.selected)}
          disabled={option.disabled}
          title={option.title}
          sub={option.sub}
          badge={option.badge}
          tone={option.tone}
          onClick={option.disabled ? undefined : () => onSelect?.(option, index)}
          tabIndex={radioTabIndex(index, tabStopIndex)}
        />
      ))}
      {note ? <p className="pv2-sheet__note">{note}</p> : null}
    </div>
  );
}

/* ── Subtitles (task.md 3.29) ─────────────────────────────────────────────────
 * The legacy showed a language list; this shows the same list from the hook 6.4's
 * pull-forward built, plus "Off", plus the 3.29 metadata: an SDH badge, a Forced
 * marker, and plain-before-SDH-before-forced ordering.
 *
 * All of it is driven by fields, not by names. "English (SDH)" arriving as a LANGUAGE
 * NAME would mean guessing the variant out of prose, and a language legitimately named
 * that way would get no badge at all while a plain one got a false one. */
function CaptionsPanel({ subtitles = {} }) {
  const { languages = [], track, select, loading, error } = subtitles;

  /* "Off" is an OPTION in the same group as the languages, not a separate control.
   *
   * It was a row of its own before 3.26, which was harmless under `aria-pressed` and
   * wrong under `role="radio"`: two adjacent controls with no relationship declared
   * between them, where a viewer hears "1 of 1" for Off and then "1 of 6" for the
   * languages and has no way to know that choosing either turns subtitles off. "Off"
   * IS the absence of a subtitle track, so it belongs in the group as a first
   * option, and a group of one is a group. */
  /* 3.29. Rows are keyed and selected on the (language, variant) identity, and
   * ordered by `sortTracks` rather than the order the fetcher happened to return.
   *
   * The key was `entry.languageId` alone, which cannot even address an SDH row: every
   * variant of a language shares one `SubLanguageID`, so two rows would collide on
   * React's key and only one would keep its identity across a re-render — which
   * surfaced as the wrong row appearing selected after changing tracks. */
  const options = useMemo(
    () => [
      { key: "off", title: "Off", sub: "No subtitles", selected: !track, onSelect: () => select(null) },
      ...sortTracks(languages).map((entry) => {
        const badge = trackBadge(entry);
        const badgeLabel = trackBadgeLabel(entry);
        return {
          key: trackKey(entry),
          title: entry.language,
          badge,
          /* The badge's expanded form goes in the accessible name, because "SDH" read
           * as three letters is not something a viewer looking for the descriptive
           * track would recognise. `sub` is the visual second line; the badge chip
           * carries the short form. */
          sub: badgeLabel ?? (entry.languageId ? String(entry.languageId) : undefined),
          selected: track
            ? trackKey(track) === trackKey(entry)
            : false,
          onSelect: () => select(entry),
        };
      }),
    ],
    [languages, track, select],
  );

  return (
    <>
      <SheetRadioGroup
        label="Subtitle track"
        options={options}
        onSelect={(option) => option.onSelect?.()}
      />
      {/* Status and error are OUTSIDE the group. A `role="status"` paragraph inside a
       * radiogroup is announced as another option, and "Loading subtitles…" would then
       * be selectable — arrows would move onto it, Enter would do nothing, and the
       * live region's announcement would be lost under the group traversal. */}
      {loading ? (
        <p className="pv2-sheet__note" role="status">
          Loading subtitles…
        </p>
      ) : null}
      {error ? (
        <p className="pv2-sheet__note" data-tone="error" role="alert">
          {error}
        </p>
      ) : null}
      {!loading && languages.length === 0 ? (
        <p className="pv2-sheet__note">No subtitles were offered for this title.</p>
      ) : null}
    </>
  );
}

/**
 * Aspect ratio.
 *
 * The full catalogue name, not `aspectShortNameForId`: "16:10" and "Fit" are
 * ambiguous standing alone, and "Stretch to Screen" versus "Fill Screen
 * (Edge-to-Edge)" are indistinguishable from their short forms. The transport
 * button keeps the short form because it has 2rem of width; the sheet is the place
 * the name finally gets said in full.
 */
function AspectPanel({ prefs = {} }) {
  const { aspectId, setAspect, persistent } = prefs;

  const options = useMemo(
    () =>
      ASPECT_RATIOS.map((mode) => ({
        key: mode.id,
        title: mode.name,
        selected: aspectId === mode.id,
        disabled: !persistent,
        onSelect: () => setAspect?.(mode.id),
      })),
    [aspectId, persistent, setAspect],
  );

  return (
    <SheetRadioGroup
      label="Aspect ratio"
      options={options}
      onSelect={(option) => option.onSelect?.()}
      note={persistent ? undefined : "This choice is not saved on this device."}
    />
  );
}

/**
 * Playback speed.
 *
 * `formatRate` gives the short "1.5x" the transport uses; "Normal" is added for 1x
 * only, because "1x" alone reads as a value nobody chose rather than as the
 * default. Snapping to the ladder on write is already `setRate`'s job
 * (`sanitizePreference`), so the list is the ladder verbatim and no row can be
 * selected that the preference would reject.
 */
function SpeedPanel({ prefs = {} }) {
  const { rate, setRate, persistent } = prefs;

  const options = useMemo(
    () =>
      PLAYER_SPEEDS.map((speed) => ({
        key: String(speed),
        title: formatRate(speed),
        sub: speed === 1 ? "Normal" : undefined,
        selected: Number(rate) === speed,
        disabled: !persistent,
        onSelect: () => setRate?.(speed),
      })),
    [persistent, rate, setRate],
  );

  return (
    <SheetRadioGroup
      label="Playback speed"
      options={options}
      onSelect={(option) => option.onSelect?.()}
      note={persistent ? undefined : "Speed is not saved on this device."}
    />
  );
}

/**
 * Volume (3.12's sheet entry).
 *
 * A row of discrete steps rather than a slider, and that is a deliberate
 * departure: the zones layout exists because the transport cannot fit on a phone,
 * and a slider is the one control that most needs horizontal room and precise
 * dragging. The percentages are computed rather than hardcoded so they cannot
 * drift from `setVolume`'s own rounding — a hardcoded "50%" next to a clamp that
 * floors to 0.48 shows two different numbers for one volume.
 *
 * `Muted` sits first and is a toggle, not a level: "the sound is off" and "the
 * sound is at 30%" are different facts, and a list of levels with no off state
 * makes a muted player look like it is playing quietly.
 */
function VolumePanel({ controls = {} }) {
  const { volume, muted, setVolume, toggleMute } = controls;
  const STEPS = [0, 0.25, 0.5, 0.75, 1];

  /* `muted` wins over the level: a muted player's volume is still 0.8 under the hood,
   * so showing "80%" checked next to "Mute" pressed tells the viewer the two disagree
   * when in fact the mute is simply louder than the level. */
  const options = useMemo(
    () =>
      STEPS.map((step) => ({
        key: String(step),
        title: `${Math.round(step * 100)}%`,
        selected: !muted && Number(volume) === step,
        disabled: !setVolume,
        onSelect: () => setVolume?.(step),
      })),
    [muted, setVolume, volume],
  );

  return (
    <>
      {/* Mute is NOT in the radiogroup, and this is the whole reason 3.26 needed
       * thinking about rather than just swapping the attributes on.
       *
       * A toggle is not a choice out of several. Muting is INDEPENDENT of the level:
       * a viewer who mutes, then unmutes, expects to get their 80% back — and if Mute
       * were option one in the level group, ArrowDown onto it would change the level
       * too, and the group's own "checked" answer would be a lie (which is it? "Mute"
       * or "80%"?). So Mute keeps `aria-pressed`, which is what a toggle actually is,
       * and the levels form their own group underneath.
       *
       * The two are still linked in one direction, deliberately: `muted` suppresses
       * the level's checked state, so exactly one of them is ever on and a screen
       * reader announces a single fact. Both being on is the state 3.12's sheet had,
       * and it is how a viewer ends up unsure whether the sound is on. */}
      <button
        type="button"
        className="pv2-sheet__row pv2-sheet__row--toggle"
        aria-pressed={Boolean(muted)}
        onClick={toggleMute}
        disabled={!toggleMute}
      >
        <span className="pv2-sheet__row-title">{muted ? "Unmute" : "Mute"}</span>
      </button>
      <SheetRadioGroup
        label="Volume"
        options={options}
        onSelect={(option) => option.onSelect?.()}
      />
    </>
  );
}

/**
 * Episodes.
 *
 * Reads `episodeNumber`/`title` because that is what the app's episode queries
 * already return (`DownloadModal.jsx` reads the same two fields off the same
 * objects), so the sheet does not need its own fetch or its own normalisation.
 * `E01 · Title` rather than the title alone: an episode list of twelve identical
 * "Episode" strings is the case the fallback exists for, and it should read as
 * "no title was supplied" rather than as twelve different unnamed episodes.
 */
function EpisodesPanel({ episodes = [], currentEpisode, onSelectEpisode }) {
  const list = Array.isArray(episodes) ? episodes : [];

  const options = useMemo(
    () =>
      list.map((ep) => {
        const number = ep?.episodeNumber;
        const label = ep?.title || `Episode ${number ?? ""}`.trim();
        return {
          key: String(ep?.id ?? number ?? label),
          title: `E${String(number ?? "?").padStart(2, "0")}`,
          sub: label,
          selected: number === currentEpisode,
          disabled: !onSelectEpisode,
          episode: ep,
        };
      }),
    [list, currentEpisode, onSelectEpisode],
  );

  if (options.length === 0) {
    return <p className="pv2-sheet__note">There are no other episodes to switch to.</p>;
  }

  /* An episode list is single-select because exactly one episode IS playing. That
   * makes `role="radiogroup"` accurate rather than merely convenient — and it is what
   * makes the arrows worth having here, since a season can be twelve rows deep. */
  return (
    <SheetRadioGroup
      label="Episode"
      options={options}
      onSelect={(option) => onSelectEpisode?.(option.episode)}
    />
  );
}

/**
 * Watch party roster.
 *
 * Names only, matching `WatchPartyPanel` rather than duplicating its avatars —
 * the host marker is the one piece of information that changes what a viewer would
 * do next, so it is carried over as text. The identity comparison uses
 * `participantId` for the same reason: two viewers can share a display name, and
 * marking the wrong one "(you)" is worse than marking nobody.
 */
function UsersPanel({ party = null, identity = null }) {
  const roster = Array.isArray(party?.room?.participants) ? party.room.participants : [];
  if (roster.length === 0) {
    return <p className="pv2-sheet__note">Nobody else is watching this title.</p>;
  }

  /* The roster is a LIST, and 3.26 is the reason to be sure of that.
   *
   * It is the one panel that is not a choice, and the one most likely to be
   * mislabelled as a group: the "you" marker makes exactly one row LOOK selected, and
   * `role="radiogroup"` would say "this is a set of options, one of which is current,
   * change it with the arrows". Nothing here can be changed. A viewer who takes that
   * at face value presses ArrowDown, hears "checked" move onto a different person, and
   * concludes the player has just reassigned them somebody else's identity — and the
   * announcement would be true, because the arrows would have moved `aria-checked`.
   *
   * `aria-current="true"` is the correct role for "this one is you": it describes a
   * position in a set without claiming the set is editable. And these are not buttons
   * at all, so they leave the tab order entirely — a viewer tabbing through the sheet
   * is not offered four controls that do nothing.
   *
   * `role="list"`/`listitem` rather than a plain div, so the count is announced
   * ("list, 4 items") and a screen-reader user can skip the whole roster without
   * arrowing through it. */
  return (
    <ul className="pv2-sheet__roster" role="list" aria-label="People watching">
      {roster.map((person) => {
        const isViewer = person.participantId === identity?.participantId;
        const marks = [isViewer ? "you" : null, person.isHost ? "host" : null]
          .filter(Boolean)
          .join(" · ");
        return (
          <li
            key={person.participantId}
            className="pv2-sheet__row pv2-sheet__row--static"
            data-self={isViewer ? "true" : undefined}
          >
            <span className="pv2-sheet__row-title">{person.name || "Guest"}</span>
            {marks ? <span className="pv2-sheet__row-sub">{marks}</span> : null}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Audio / dub (task.md R4.1).
 *
 * ── Why the three cases are visually distinct ──────────────────────────────────
 * `describeAudio` collapses "no audio groups", "one track" and "several tracks"
 * into a model, and this renders each differently on purpose. All three used to be
 * one empty sheet, which is indistinguishable from a missing feature:
 *
 *   several  → a radiogroup, because there is a real choice to make.
 *   one      → a read-only label, NOT a radiogroup of one. A single-option radio
 *              group announces "1 of 1" and invites arrow keys that have nowhere to
 *              go; it claims a control that cannot do anything.
 *   none     → a read-only note. In native-HLS mode (Safari) there is no hls.js
 *              engine at all, so "no tracks" means "nothing to ask", not "broken".
 *
 * The static rows use `pv2-sheet__row--static` on a `<div>`, the same treatment the
 * legacy player got when its fake "Original" audio row was found to be a dead button.
 */
function AudioPanel({ audio = null, selectAudio = () => {} }) {
  const model = audioOptions(audio);

  if (!model) {
    /* Both non-choice cases land here. `audio.note` is null only if the caller sent
     * nothing at all, which is a different message than "this source has no
     * alternates" — so fall back rather than rendering an empty box. */
    const note = audio?.note || "Audio information is not available for this source.";
    return (
      <p className="pv2-sheet__note" data-readonly="true">
        {note}
      </p>
    );
  }

  return (
    <SheetRadioGroup
      label={model.label}
      options={model.options.map((option) => ({
        ...option,
        /* Per-option `onSelect`, matching AspectPanel/SpeedPanel/VolumePanel. The
         * guard is not defensive noise: `options` is deduplicated while `index` is
         * engine state, so a stale position must not become `undefined` written
         * onto the live engine. */
        onSelect: () => {
          if (Number.isInteger(option.index)) selectAudio(option.index);
        },
      }))}
      onSelect={(option) => option.onSelect?.()}
    />
  );
}

/**
 * Servers.
 *
 * A label and nothing else, because V2 has no server LIST to render — `usePlayerSource`
 * returns one resolved source and `serverLabel` is its label. A quality picker
 * needs the ladder's servers with their variants, and that data is not plumbed to
 * the shell yet. Showing the active server keeps the panel honest about what the
 * player actually knows.
 */
function ServerPanel({ serverLabel = "" }) {
  return (
    <p className="pv2-sheet__note">
      {serverLabel
        ? `Watching from ${serverLabel}. Switching servers is not available in this player yet.`
        : "No server has been resolved for this title yet."}
    </p>
  );
}