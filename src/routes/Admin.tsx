import { Route, Routes } from "react-router-dom";
import { AdminLayout } from "./admin/AdminLayout";
import { Sources } from "./admin/Sources";
import { SendSignal } from "./admin/SendSignal";
import { PushTest } from "./admin/PushTest";
import { Empty } from "../components/ui";

const Soon = ({ what }: { what: string }) => <Empty title={what} body="Coming in a later build stage." />;

export function Admin({ userId }: { userId: string }) {
  return (
    <Routes>
      <Route element={<AdminLayout />}>
        <Route index element={<Soon what="Users" />} />
        <Route path="signals" element={<Soon what="Signals" />} />
        <Route path="send" element={<SendSignal />} />
        <Route path="sources" element={<Sources />} />
        <Route path="push" element={<PushTest userId={userId} />} />
        <Route path="settings" element={<Soon what="Settings" />} />
        <Route path="reports" element={<Soon what="Reports" />} />
      </Route>
    </Routes>
  );
}
