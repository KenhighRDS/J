import { useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { AmountSheet } from "./AmountSheet";
import type { Profile } from "../lib/types";

const Icon = {
  signals: (a: boolean) => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={a ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M3 12h4l3-8 4 16 3-8h4" /></svg>,
  stocks: (a: boolean) => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={a ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M4 18l5-6 4 3 7-9" /><path d="M15 6h5v5" /></svg>,
  crypto: (a: boolean) => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={a ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M9.5 8h4a2 2 0 0 1 0 4h-4zM9.5 12h4.6a2 2 0 0 1 0 4H9.5zM9.5 8v8M11 6.4V8M13 6.4V8M11 16v1.6M13 16v1.6" /></svg>,
  settings: (a: boolean) => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={a ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>,
  admin: (a: boolean) => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={a ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z" /></svg>,
};

/** Fixed full-height frame; the bottom menu is the last flex row, never position: fixed. */
export function Shell({ profile, reload, previewAsk }: { profile: Profile; reload?: () => Promise<void>; previewAsk?: boolean }) {
  const { pathname } = useLocation();
  // The one question about money: asked the first time a member reaches Wann, Stocks or the portfolio, until they answer.
  // Not on a single Wann call: that page has its own sheets, and the call should not wait behind a question.
  const [askLater, setAskLater] = useState(false);
  const amountPage = previewAsk || /^\/(wann|portfolio)$|^\/(stocks|crypto)(\/|$)/.test(pathname);
  const askAmount = amountPage && !askLater && profile.default_amount_set_at == null;
  const fullScreen = /^\/(signal|wann)\/[^/]+$/.test(pathname) || /^\/reports\/[^/]+$/.test(pathname);
  const tabs = [
    { to: "/", label: "Signals", icon: Icon.signals, also: ["/signal", "/wann"] },
    { to: "/stocks", label: "Stocks", icon: Icon.stocks, also: ["/portfolio"] },       // the portfolio opens from the Stocks page
    { to: "/crypto", label: "Crypto", icon: Icon.crypto, also: [] as string[] },
    { to: "/settings", label: "Settings", icon: Icon.settings, also: ["/reports"] },   // reports open from Settings
    ...(profile.role === "admin" ? [{ to: "/admin", label: "Admin", icon: Icon.admin, also: [] as string[] }] : []),
  ];
  return (
    <div className="app-frame">
      <div className="scroll-area">
        <Outlet />
      </div>
      <AmountSheet open={askAmount} onClose={() => setAskLater(true)} amount={profile.default_amount ?? 100} onSaved={reload ?? (async () => undefined)} first preview={previewAsk} />
      {!fullScreen && (
        <nav className="shrink-0 border-t border-border bg-bg pb-[env(safe-area-inset-bottom)]" aria-label="Main">
          <div className="mx-auto flex max-w-md">
            {tabs.map((t) => {
              const under = t.also.some((p) => pathname === p || pathname.startsWith(`${p}/`));   // a page that lives under this tab
              return (
                <NavLink key={t.to} to={t.to} end={t.to === "/"} className={({ isActive }) => `focus-ring flex min-w-0 flex-1 flex-col items-center gap-1 py-2.5 text-[11px] ${isActive || under ? "text-text" : "text-muted"}`}>
                  {({ isActive }) => (<>{t.icon(isActive || under)}<span>{t.label}</span></>)}
                </NavLink>
              );
            })}
          </div>
        </nav>
      )}
    </div>
  );
}
