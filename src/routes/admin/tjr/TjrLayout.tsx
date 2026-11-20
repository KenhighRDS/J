import { NavLink, Outlet } from "react-router-dom";
import { BASE } from "./parts";

const tabs = [{ to: "", label: "Desk", end: true }, { to: "/runs", label: "Backtests" }, { to: "/builder", label: "Builder" }, { to: "/journal", label: "Journal" }, { to: "/setup", label: "Setup" }];

/** The TJR module's own sections, under the Admin tabs. */
export function TjrLayout({ base = BASE }: { base?: string }) {
  return (
    <div>
      <nav className="-mx-4 mb-4 flex gap-5 overflow-x-auto border-b border-border px-5 [scrollbar-width:none]" aria-label="TJR sections">
        {tabs.map((t) => <NavLink key={t.label} to={`${base}${t.to}`} end={t.end} className={({ isActive }) => `focus-ring -mb-px inline-flex h-10 shrink-0 items-center border-b-2 text-[15px] ${isActive ? "border-text text-text" : "border-transparent text-muted"}`}>{t.label}</NavLink>)}
      </nav>
      <Outlet />
    </div>
  );
}
