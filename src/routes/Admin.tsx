import { Route, Routes } from "react-router-dom";
import { AdminLayout } from "./admin/AdminLayout";
import { Sources } from "./admin/Sources";
import { SendSignal } from "./admin/SendSignal";
import { PushTest } from "./admin/PushTest";
import { Users } from "./admin/Users";
import { AdminSignals } from "./admin/Signals";
import { AdminSettings } from "./admin/AdminSettings";
import { AdminReports } from "./admin/AdminReports";
import type { Profile } from "../lib/types";

export function Admin({ me }: { me: Profile }) {
  return (
    <Routes>
      <Route element={<AdminLayout />}>
        <Route index element={<Users me={me} />} />
        <Route path="signals" element={<AdminSignals />} />
        <Route path="send" element={<SendSignal />} />
        <Route path="sources" element={<Sources />} />
        <Route path="push" element={<PushTest userId={me.id} />} />
        <Route path="settings" element={<AdminSettings />} />
        <Route path="reports" element={<AdminReports />} />
      </Route>
    </Routes>
  );
}
