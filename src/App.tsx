import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useSession, useProfile } from "./lib/auth";
import { isConfigured } from "./lib/supabase";
import { Shell } from "./components/Shell";
import { AndroidBar } from "./components/AndroidBar";
import { PushListener } from "./components/PushListener";
import { BiometricGate } from "./components/BiometricGate";
import { UpdateSheet } from "./components/UpdateSheet";
import { Alerts } from "./routes/Alerts";
import { Tracker } from "./routes/Tracker";
import { Login } from "./routes/Login";
import { Code } from "./routes/Code";
import { Welcome } from "./routes/Welcome";
import { Home } from "./routes/Home";
import { SignalRoute } from "./routes/Signal";
import { Preview } from "./routes/Preview";
import { WannList, WannRoute } from "./routes/Wann";
import { StocksList, StockRoute } from "./routes/Stocks";
import { Portfolio } from "./routes/Portfolio";
import { Reports } from "./routes/Reports";
import { ReportRoute } from "./routes/Report";
import { Settings } from "./routes/Settings";
import { Admin } from "./routes/Admin";
import { Logo, Spinner } from "./components/ui";

function Splash() {
  return <div className="app-frame items-center justify-center"><Logo size={72} className="pulse" /></div>;
}

export default function App() {
  const { session, loading } = useSession();
  const { profile, reload } = useProfile(session);
  const { pathname } = useLocation();
  if (!isConfigured) {
    return (
      <div className="app-frame items-center justify-center px-8 text-center">
        <Logo size={56} />
        <p className="mt-6 text-[15px]">J isn't configured for this build.</p>
        <p className="mt-2 text-[14px] text-muted">Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, then build again.</p>
      </div>
    );
  }
  if (loading) return <Splash />;
  if (pathname === "/welcome") return <Welcome />;
  if (import.meta.env.DEV && pathname.startsWith("/__preview")) return <Preview />;
  if (!session) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/login/code" element={<Code />} />
        <Route path="*" element={<Navigate to="/login" replace state={{ from: pathname }} />} />
      </Routes>
    );
  }
  if (!profile) return <div className="app-frame items-center justify-center"><Spinner /></div>;
  return (
    <BiometricGate>
      <AndroidBar />
      <PushListener />
      <UpdateSheet />
      <Routes>
        <Route element={<Shell profile={profile} reload={reload} />}>
          <Route index element={<Home profile={profile} />} />
          <Route path="/signal/:id" element={<SignalRoute profile={profile} reloadProfile={reload} />} />
          <Route path="/wann" element={<WannList profile={profile} />} />
          <Route path="/wann/:id" element={<WannRoute profile={profile} />} />
          <Route path="/stocks" element={<StocksList profile={profile} />} />
          <Route path="/stocks/:id" element={<StockRoute profile={profile} />} />
          <Route path="/crypto" element={<StocksList profile={profile} asset="crypto" />} />
          <Route path="/crypto/:id" element={<StockRoute profile={profile} asset="crypto" />} />
          <Route path="/portfolio" element={<Portfolio profile={profile} />} />
          <Route path="/reports" element={<Reports profile={profile} />} />
          <Route path="/reports/:id" element={<ReportRoute profile={profile} />} />
          <Route path="/settings" element={<Settings profile={profile} reload={reload} />} />
          {profile.role === "admin" && <Route path="/admin/*" element={<Admin me={profile} />} />}
          <Route path="/login/*" element={<Navigate to="/" replace />} />
          <Route path="/settings/alerts" element={<Alerts />} />
          <Route path="/settings/tracker" element={<Tracker profile={profile} reload={reload} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BiometricGate>
  );
}
