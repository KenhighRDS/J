import { NavLink, Outlet } from "react-router-dom";
import { PageTitle } from "../../components/ui";

const tabs = [
  { to: "/admin", label: "Users", end: true },
  { to: "/admin/signals", label: "Signals" },
  { to: "/admin/send", label: "Send" },
  { to: "/admin/sources", label: "EA sources" },
  { to: "/admin/push", label: "Push test" },
  { to: "/admin/settings", label: "Settings" },
  { to: "/admin/reports", label: "Reports" },
  { to: "/admin/backtest", label: "Backtest" },
];

export function AdminLayout() {
  return (
    <div className="mx-auto w-full max-w-md pb-6">
      <PageTitle>Admin</PageTitle>
      <nav className="flex gap-1 overflow-x-auto px-4 pb-3 [scrollbar-width:none]" aria-label="Admin sections">
        {tabs.map((t) => (
          <NavLink key={t.to} to={t.to} end={t.end} className={({ isActive }) => `focus-ring shrink-0 rounded-full px-3.5 h-9 inline-flex items-center text-[14px] ${isActive ? "bg-text text-black" : "bg-surface-2 text-muted"}`}>{t.label}</NavLink>
        ))}
      </nav>
      <div className="px-4"><Outlet /></div>
    </div>
  );
}
