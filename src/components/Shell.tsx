import { NavLink, Outlet, useLocation } from "react-router-dom";
import type { Profile } from "../lib/types";

const Icon = {
  signals: (a: boolean) => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={a ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M3 12h4l3-8 4 16 3-8h4" /></svg>,
  reports: (a: boolean) => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={a ? 2.2 : 1.8} strokeLinecap="round"><path d="M5 20V10M12 20V4M19 20v-7" /></svg>,
  settings: (a: boolean) => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={a ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>,
  admin: (a: boolean) => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={a ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z" /></svg>,
};

/** Fixed full-height frame; the bottom menu is the last flex row, never position: fixed. */
export function Shell({ profile }: { profile: Profile }) {
  const { pathname } = useLocation();
  const fullScreen = /^\/(signal|wann)\/[^/]+$/.test(pathname) || /^\/reports\/[^/]+$/.test(pathname);
  const tabs = [
    { to: "/", label: "Signals", icon: Icon.signals },
    { to: "/reports", label: "Reports", icon: Icon.reports },
    { to: "/settings", label: "Settings", icon: Icon.settings },
    ...(profile.role === "admin" ? [{ to: "/admin", label: "Admin", icon: Icon.admin }] : []),
  ];
  return (
    <div className="app-frame">
      <div className="scroll-area">
        <Outlet />
      </div>
      {!fullScreen && (
        <nav className="shrink-0 border-t border-border bg-bg pb-[env(safe-area-inset-bottom)]" aria-label="Main">
          <div className="mx-auto flex max-w-md">
            {tabs.map((t) => (
              <NavLink key={t.to} to={t.to} end={t.to === "/"} className={({ isActive }) => `focus-ring flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] ${isActive ? "text-text" : "text-muted"}`}>
                {({ isActive }) => (<>{t.icon(isActive)}<span>{t.label}</span></>)}
              </NavLink>
            ))}
          </div>
        </nav>
      )}
    </div>
  );
}
