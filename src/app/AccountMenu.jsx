import { LogIn, History, Settings } from "lucide-react";
import { useNavigate } from "react-router-dom";
import Popover from "../components/Popover";
import { useI18n } from "../i18n/index.jsx";
import { useAppAuth } from "../context/auth";

/* Settings dropdown (Cinejoy .head-menu): Login / Settings / Watch History.
   Rendered as a sibling of the nav pill so it isn't clipped by overflow:hidden
   nor trapped by the navbar's backdrop-filter root. Positioned with fixed
   coords measured off the toggle button. */
function AccountMenu({ open, onClose, triggerRef, position }) {
  const navigate = useNavigate();
  const { t } = useI18n();
  const { user } = useAppAuth();

  return (
    <Popover
      isOpen={open}
      onClose={onClose}
      triggerRef={triggerRef}
      className="head-menu"
      align="left"
      style={position ? { position: "fixed", top: position.top, left: position.left } : undefined}
      role="menu"
    >
      {user && (
        <>
          <button
            type="button"
            role="menuitem"
            className="head-menu-item head-menu-item--account"
            onClick={() => navigate("/settings")}
          >
            {user.picture ? (
              <img
                src={user.picture}
                alt={user.name || "User"}
                className="head-menu-avatar"
                referrerPolicy="no-referrer"
              />
            ) : (
              <span className="head-menu-avatar head-menu-avatar--initial">
                {(user.name || user.email || "?").charAt(0).toUpperCase()}
              </span>
            )}
            <span className="head-menu-account-text">
              <span className="head-menu-account-name">{user.name}</span>
              <span className="head-menu-account-email">{user.email}</span>
            </span>
          </button>
          <div className="head-menu-sep" />
        </>
      )}
      {!user && (
        <>
          <button
            type="button"
            role="menuitem"
            className="head-menu-item"
            onClick={() => navigate("/settings")}
          >
            <LogIn size={16} className="head-menu-item-icon" />
            <span>{t("nav.login")}</span>
          </button>
          <div className="head-menu-sep" />
        </>
      )}
      <button
        type="button"
        role="menuitem"
        className="head-menu-item"
        onClick={() => navigate("/settings")}
      >
        <Settings size={16} className="head-menu-item-icon" />
        <span>{t("nav.settings")}</span>
      </button>
      <button
        type="button"
        role="menuitem"
        className="head-menu-item"
        onClick={() => navigate("/history")}
      >
        <History size={16} className="head-menu-item-icon" />
        <span>{t("nav.watchHistory")}</span>
      </button>
    </Popover>
  );
}

export default AccountMenu;