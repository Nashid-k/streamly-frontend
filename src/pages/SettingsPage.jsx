import { useMemo, useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowLeft,
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

const useSetting = (key, defaultValue) => {
  const [value, setValue] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(`setting-${key}`) ?? "null") ?? defaultValue;
    } catch {
      return defaultValue;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(`setting-${key}`, JSON.stringify(value));
    } catch {}
  }, [key, value]);
  return [value, setValue];
};

function Toggle({ checked, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      style={{
        width: "44px",
        height: "26px",
        borderRadius: "999px",
        border: "none",
        cursor: "pointer",
        flexShrink: 0,
        position: "relative",
        transition: "background 0.25s ease",
        background: checked ? "var(--accent-gradient)" : "rgba(255,255,255,0.14)",
        boxShadow: checked ? "0 0 12px rgba(244,63,94,0.35)" : "inset 0 1px 0 rgba(255,255,255,0.08)",
      }}
    >
      <span
        style={{
          position: "absolute",
          top: "3px",
          left: checked ? "22px" : "3px",
          width: "20px",
          height: "20px",
          borderRadius: "50%",
          background: "#fff",
          transition: "left 0.25s cubic-bezier(0.16,1,0.3,1)",
          boxShadow: "0 1px 3px rgba(0,0,0,0.4)",
        }}
      />
    </button>
  );
}

function SettingRow({ icon: Icon, title, description, children }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "1rem",
        padding: "1rem 1.25rem",
      }}
    >
      <span
        style={{
          width: "38px",
          height: "38px",
          borderRadius: "12px",
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "rgba(244,63,94,0.12)",
          color: "#fb7185",
        }}
      >
        <Icon size={18} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: "#fafafa", fontWeight: 600, fontSize: "0.95rem" }}>{title}</div>
        {description && (
          <div style={{ color: "#71717a", fontSize: "0.8rem", marginTop: "2px" }}>{description}</div>
        )}
      </div>
      {children}
    </div>
  );
}

export default function SettingsPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [autoplay, setAutoplay] = useSetting("autoplay", true);
  const [muteTrailers, setMuteTrailers] = useSetting("muteTrailers", false);
  const [hdThumbs, setHdThumbs] = useSetting("hdThumbs", true);
  const [reduceMotion, setReduceMotion] = useSetting("reduceMotion", false);
  const [notifications, setNotifications] = useSetting("notifications", true);

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
      control: <Toggle checked={autoplay} onChange={setAutoplay} label="Autoplay next episode" />,
    },
    {
      section: "Playback",
      title: "Mute trailers on hover",
      description: "Play trailers with sound off by default",
      icon: MonitorPlay,
      control: <Toggle checked={muteTrailers} onChange={setMuteTrailers} label="Mute trailers on hover" />,
    },
    {
      section: "Appearance",
      title: "High-quality thumbnails",
      description: "Stream higher resolution artwork",
      icon: Palette,
      control: <Toggle checked={hdThumbs} onChange={setHdThumbs} label="High-quality thumbnails" />,
    },
    {
      section: "Appearance",
      title: "Reduce motion",
      description: "Minimize animations and transitions",
      icon: Subtitles,
      control: <Toggle checked={reduceMotion} onChange={setReduceMotion} label="Reduce motion" />,
    },
    {
      section: "Notifications",
      title: "Show notifications",
      description: "Get notified when titles are added to your list",
      icon: Bell,
      control: <Toggle checked={notifications} onChange={setNotifications} label="Show notifications" />,
    },
    {
      section: "Account",
      title: "My List",
      description: "Your saved movies and shows",
      icon: Bookmark,
      control: (
        <Link to="/watchlist" aria-label="Open My List" style={{ display: "flex", alignItems: "center", color: "inherit" }}>
          <ChevronRight size={18} style={{ color: "#71717a" }} />
        </Link>
      ),
    },
    {
      section: "Account",
      title: "Watch History",
      description: "Everything you've watched",
      icon: Clock,
      control: (
        <Link to="/history" aria-label="Open Watch History" style={{ display: "flex", alignItems: "center", color: "inherit" }}>
          <ChevronRight size={18} style={{ color: "#71717a" }} />
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
          style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", display: "flex", alignItems: "center", padding: 0 }}
        >
          <ChevronRight size={18} style={{ color: "#71717a" }} />
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
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.05, ease: [0.16, 1, 0.3, 1] }}
      style={{
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: "18px",
        overflow: "hidden",
      }}
    >
      {group.items.map((s, i) => (
        <div
          key={s.title}
          style={{
            borderTop: i > 0 ? "1px solid rgba(255,255,255,0.06)" : "none",
          }}
        >
          <SettingRow icon={s.icon} title={s.title} description={s.description}>
            {s.control}
          </SettingRow>
        </div>
      ))}
    </motion.div>
  );

  return (
    <div className="main-content" style={{ padding: "5.5rem 1.5rem 5rem", minHeight: "100vh", position: "relative" }}>
      <SEO title="Settings" description="Customize your Streamly experience." />
      <div
        style={{
          pointerEvents: "none",
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse 55% 35% at 50% 0%, rgba(244,63,94,0.10) 0%, transparent 70%)",
          zIndex: 0,
        }}
      />

      <div style={{ position: "relative", zIndex: 1, maxWidth: "720px", margin: "0 auto" }}>
        {/* Back + title */}
        <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "2rem" }}>
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="btn btn-glass"
            style={{ padding: "8px 16px", borderRadius: "100px", fontSize: "0.9rem" }}
            aria-label="Go back"
          >
            <ArrowLeft size={16} /> Back
          </button>
          <div>
            <h1
              style={{
                margin: 0,
                fontSize: "1.75rem",
                fontWeight: 800,
                letterSpacing: "-0.03em",
                background: "var(--accent-gradient)",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                WebkitTextFillColor: "transparent",
                color: "transparent",
              }}
            >
              Settings
            </h1>
            <p style={{ margin: "2px 0 0", color: "#71717a", fontSize: "0.85rem" }}>
              Personalize your Streamly experience
            </p>
          </div>
        </div>

        {/* Search input */}
        <div style={{ position: "relative", marginBottom: "1.5rem" }}>
          <Search
            size={18}
            style={{
              position: "absolute",
              left: "14px",
              top: "50%",
              transform: "translateY(-50%)",
              color: "#71717a",
              pointerEvents: "none",
            }}
          />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search settings..."
            aria-label="Search settings"
            style={{
              width: "100%",
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: "14px",
              padding: "0.85rem 1rem 0.85rem 2.75rem",
              fontSize: "0.95rem",
              color: "#fff",
              fontFamily: "inherit",
              outline: "none",
              transition: "border-color 0.2s ease, box-shadow 0.2s ease",
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = "rgba(244,63,94,0.5)";
              e.currentTarget.style.boxShadow = "0 0 0 3px rgba(244,63,94,0.15)";
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)";
              e.currentTarget.style.boxShadow = "none";
            }}
          />
        </div>

        {filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "3rem 1rem", color: "#71717a" }}>
            <Search size={28} style={{ margin: "0 auto 0.75rem", opacity: 0.5 }} />
            <p style={{ margin: 0, fontWeight: 600, color: "#a1a1aa" }}>No settings match "{query}"</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
            {sections.map((group, i) => (
              <div key={group.name}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem" }}>
                  <h2
                    style={{
                      margin: 0,
                      fontSize: "0.8rem",
                      fontWeight: 700,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      color: "#71717a",
                    }}
                  >
                    {group.name}
                  </h2>
                  <div style={{ height: "1px", flex: 1, background: "rgba(255,255,255,0.08)" }} />
                </div>
                {renderCard(group, i)}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}