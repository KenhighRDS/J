import { Route, Routes } from "react-router-dom";
import { AdminLayout } from "./admin/AdminLayout";
import { Sources } from "./admin/Sources";
import { SendSignal } from "./admin/SendSignal";
import { PushTest } from "./admin/PushTest";
import { Users } from "./admin/Users";
import { AdminSignals } from "./admin/Signals";
import { AdminSettings } from "./admin/AdminSettings";
import { AdminReports } from "./admin/AdminReports";
import { Backtest } from "./admin/Backtest";
import { WannReport } from "./admin/WannReport";
import { AdminStocks } from "./admin/Stocks";
import { TjrLayout } from "./admin/tjr/TjrLayout";
import { Desk } from "./admin/tjr/Desk";
import { Run, Runs } from "./admin/tjr/Runs";
import { TradePage } from "./admin/tjr/TradePage";
import { Builder } from "./admin/tjr/Builder";
import { Journal } from "./admin/tjr/Journal";
import { Setup } from "./admin/tjr/Setup";
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
        <Route path="backtest" element={<Backtest />} />
        <Route path="wann" element={<WannReport />} />
        <Route path="stocks" element={<AdminStocks />} />
        <Route path="crypto" element={<AdminStocks key="crypto" asset="crypto" />} />
        <Route path="tjr" element={<TjrLayout />}>
          <Route index element={<Desk />} />
          <Route path="runs" element={<Runs />} />
          <Route path="runs/:id" element={<Run />} />
          <Route path="runs/:id/:seq" element={<TradePage />} />
          <Route path="builder" element={<Builder />} />
          <Route path="journal" element={<Journal />} />
          <Route path="setup" element={<Setup />} />
        </Route>
      </Route>
    </Routes>
  );
}
