import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useSession, useProfile } from "./lib/auth";
import { isConfigured } from "./lib/supabase";
import { Shell } from "./components/Shell";
import { AndroidBar } from "./components/AndroidBar";
import { Login } from "./routes/Login";
import { Code } from "./routes/Code";
import { Welcome } from "./routes/Welcome";
import { Home } from "./routes/Home";
import { Reports } from "./routes/Reports";
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
    <>
      <AndroidBar />
      <Routes>
        <Route element={<Shell profile={profile} />}>
          <Route index element={<Home />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/settings" element={<Settings profile={profile} reload={reload} />} />
          {profile.role === "admin" && <Route path="/admin/*" element={<Admin />} />}
          <Route path="/login/*" element={<Navigate to="/" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </>
  );
}
