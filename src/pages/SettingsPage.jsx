import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Search,
  Play,
  Subtitles,
  MonitorPlay,
  Palette,
  Bell,
  Bookmark,
  Clock,
  Keyboard,
  ChevronRight,
} from "lucide-react";
import SEO from "../components/SEO";
import ContentPageHeader from "../components/ContentPageHeader";
import { usePreferences } from "../context/preferences";

function Toggle({ checked, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`setting-toggle${checked ? " setting-toggle--checked" : ""}`}
    >
      <span className="setting-toggle__thumb" />
    </button>
  );
}

function SettingRow({ icon: Icon, title, description, children }) {
  return (
    <div className="setting-row">
      <span className="setting-row__icon">
        <Icon size={18} />
      </span>
      <div className="setting-row__copy">
        <div className="setting-row__title">{title}</div>
        {description && (
          <div className="setting-row__description">{description}</div>
        )}
      </div>
      {children}
    </div>
  );
}

export default function SettingsPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const {
    autoplay,
    muteTrailers,
    hdThumbs,
    reduceMotion,
    notifications,
    setPreference,
  } = usePreferences();

  const q = useMemo(() => query.trim().toLowerCase(), [query]);

  const openShortcuts = () => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "?", shiftKey: true }));
  };

  const settings = [
    {
      section: "Playback",
      title: "Autoplay next episode",
      description: "Start the next episode automatically",
      icon: Play,
      control: <Toggle checked={autoplay} onChange={(value) => setPreference("autoplay", value)} label="Autoplay next episode" />,
    },
    {
      section: "Playback",
      title: "Mute trailer audio",
      description: "Open trailers with sound off by default",
      icon: MonitorPlay,
      control: <Toggle checked={muteTrailers} onChange={(value) => setPreference("muteTrailers", value)} label="Mute trailer audio" />,
    },
    {
      section: "Appearance",
      title: "High-quality thumbnails",
      description: "Stream higher resolution artwork",
      icon: Palette,
      control: <Toggle checked={hdThumbs} onChange={(value) => setPreference("hdThumbs", value)} label="High-quality thumbnails" />,
    },
    {
      section: "Appearance",
      title: "Reduce motion",
      description: "Minimize animations and transitions",
      icon: Subtitles,
      control: <Toggle checked={reduceMotion} onChange={(value) => setPreference("reduceMotion", value)} label="Reduce motion" />,
    },
    {
      section: "Notifications",
      title: "Show in-app notifications",
      description: "Show confirmations and activity updates while browsing",
      icon: Bell,
      control: <Toggle checked={notifications} onChange={(value) => setPreference("notifications", value)} label="Show in-app notifications" />,
    },
    {
      section: "Account",
      title: "My List",
      description: "Your saved movies and shows",
      icon: Bookmark,
      control: (
        <Link to="/watchlist" aria-label="Open My List" className="setting-row__link">
          <ChevronRight size={18} />
        </Link>
      ),
    },
    {
      section: "Account",
      title: "Watch History",
      description: "Everything you've watched",
      icon: Clock,
      control: (
        <Link to="/history" aria-label="Open Watch History" className="setting-row__link">
          <ChevronRight size={18} />
        </Link>
      ),
    },
    {
      section: "Account",
      title: "Keyboard Shortcuts",
      description: "Play, pause, timelines and more",
      icon: Keyboard,
      control: (
        <button
          type="button"
          onClick={openShortcuts}
          aria-label="Show Keyboard Shortcuts"
          className="setting-row__link"
        >
          <ChevronRight size={18} />
        </button>
      ),
    },
  ];

  const filtered = q
    ? settings.filter((s) => `${s.title} ${s.description}`.toLowerCase().includes(q))
    : settings;

  const order = ["Playback", "Appearance", "Notifications", "Account"];
  const sections = order
    .map((name) => ({ name, items: filtered.filter((s) => s.section === name) }))
    .filter((s) => s.items.length > 0);

  const renderCard = (group, index) => (
    <motion.div
      key={group.name}
      initial={false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.05, ease: [0.16, 1, 0.3, 1] }}
      className="settings-card"
    >
      {group.items.map((s, i) => (
        <div key={s.title} className={`settings-card__item${i > 0 ? " settings-card__item--bordered" : ""}`}>
          <SettingRow icon={s.icon} title={s.title} description={s.description}>
            {s.control}
          </SettingRow>
        </div>
      ))}
    </motion.div>
  );

  return (
    <div className="main-content content-page settings-page">
      <SEO title="Settings" description="Customize your Streamly experience." />
      <div className="settings-page__glow" aria-hidden="true" />

      <div className="content-page__inner settings-page__inner">
        <ContentPageHeader
          eyebrow="Preferences"
          title="Settings"
          description="Make Streamly feel like it was built for you."
          onBack={() => navigate(-1)}
        />

        {/* Search input */}
        <div className="settings-search">
          <Search
            size={18}
            className="settings-search__icon"
            aria-hidden="true"
          />
          <input
            className="settings-search__input"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search settings..."
            aria-label="Search settings"
          />
        </div>

        {filtered.length === 0 ? (
          <div className="content-page__notice">
            <Search size={28} />
            <p>No settings match "{query}"</p>
          </div>
        ) : (
          <div className="settings-sections">
            {sections.map((group, i) => (
              <section key={group.name} className="settings-section">
                <div className="settings-section__heading">
                  <h2>{group.name}</h2>
                  <div aria-hidden="true" />
                </div>
                {renderCard(group, i)}
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
