function SettingRow({ title, description, children, highlight = false }) {
  return (
    <div className={`setting-row${highlight ? " bg-white/[0.04] rounded-xl px-3" : ""}`}>
      <div className="setting-meta">
        <span className="setting-title">{title}</span>
        {description && <span className="setting-desc">{description}</span>}
      </div>
      <div className="setting-control">{children}</div>
    </div>
  );
}

export default SettingRow;