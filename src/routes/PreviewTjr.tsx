// Dev-only: the TJR admin pages without a backend.
//   /__preview/tjr   /__preview/tjr/runs   /__preview/tjr/runs/<id>   /__preview/tjr/runs/<id>/<seq>
//   /__preview/tjr/builder   /__preview/tjr/journal   /__preview/tjr/setup      add ?state=kill|live|fresh for the desk
// The committed fixture is a hand-drawn tape, not market data. If tjr/reports/preview/real.json exists on this machine
// (python research/make_fixture.py real ...), add ?real=1 to look at real runs: the dev server reads that file from
// disk. It is never imported, so it can never end up in a build, and it is never committed.
import { useEffect, useState } from "react";
import { Route, Routes, useSearchParams } from "react-router-dom";
import { PageTitle } from "../components/ui";
import { Builder } from "./admin/tjr/Builder";
import { Desk } from "./admin/tjr/Desk";
import { Journal } from "./admin/tjr/Journal";
import { Run, Runs } from "./admin/tjr/Runs";
import { Setup } from "./admin/tjr/Setup";
import { TjrLayout } from "./admin/tjr/TjrLayout";
import { TradePage } from "./admin/tjr/TradePage";
import type { TjrPreview } from "./admin/tjr/parts";
import drawn from "./admin/tjr/fixture.json";
import type { TjrStatus } from "../lib/tjr";

const BASE = "/__preview/tjr";
const status = (state: string | null): TjrStatus => ({
  mode: state === "live" ? "live" : state === "kill" || state === "fresh" ? "off" : "paper", kill: state === "kill", kill_at: state === "kill" ? "2026-11-20T15:02:00Z" : null,
  live_unlocked: state === "live", live_unlocked_at: null, active_version_id: "v1", has_worker_key: state !== "fresh", worker_seen_at: state === "fresh" ? null : new Date(Date.now() - 14000).toISOString(),
  worker_online: state !== "fresh" && state !== "kill", worker_info: state === "fresh" ? {} : { feed: "price files only, no live feed", broker: "none (simulated book)", datasets: ["ES", "NQ"], rules_version: "0.1.0", live_capable: false },
});

export const isTjrPreview = (pathname: string) => pathname === BASE || pathname.startsWith(`${BASE}/`);
export function TjrPreview() {
  const [params] = useSearchParams(), state = params.get("state");
  const [data, setData] = useState<Pick<TjrPreview, "runs" | "trades" | "events">>(drawn as unknown as TjrPreview);
  const wantReal = import.meta.env.DEV && Boolean(params.get("real"));
  const [ready, setReady] = useState(!wantReal);
  useEffect(() => {
    if (!wantReal) return;
    // served straight from the project folder by the dev server; a production build has no such file and never asks
    void fetch("/tjr/reports/preview/real.json").then((r) => r.json()).then((d: TjrPreview) => setData(d)).catch(() => undefined).finally(() => setReady(true));
  }, [wantReal]);
  if (!ready) return null;
  const preview: TjrPreview = {
    ...(state === "fresh" ? { runs: [], trades: [], events: [] } : data), base: BASE, status: status(state),
    jobs: state === "fresh" ? [] : [{ id: "j1", kind: "compare", params: { models: ["A", "E"] }, status: "queued", note: null, run_ids: [], created_at: new Date().toISOString(), finished_at: null }, { id: "j2", kind: "backtest", params: { model: "C" }, status: "failed", note: "RuntimeError: model C needs a data file for ES too", run_ids: [], created_at: new Date().toISOString(), finished_at: new Date().toISOString() }],
    versions: state === "fresh" ? [] : [{ id: "v1", name: "Wider BOS window", note: "Does a slower break still work?", model: "A", experimental: false, created_at: "2026-11-20T01:10:00Z", config: { model: "A", bos_window_bars: 9, exits: { min_rr: 1.5 } } }, { id: "v2", name: "Timeframe reading, no SMT", note: "", model: "E", experimental: true, created_at: "2026-11-19T20:00:00Z", config: { model: "E" } }],
    datasets: state === "fresh" ? [] : [{ symbol: "ES", source: "Massive futures aggregates, 1-minute", first_at: "2024-11-25T05:00:00Z", last_at: "2026-11-19T16:55:00Z", rows: 702151, roll_method: "", seen_at: "" }, { symbol: "NQ", source: "Massive futures aggregates, 1-minute", first_at: "2024-11-25T05:00:00Z", last_at: "2026-11-19T16:51:00Z", rows: 701769, roll_method: "", seen_at: "" }],
  };
  return (
    <div className="app-frame"><div className="scroll-area">
      <div className="mx-auto w-full max-w-md pb-10 md:max-w-3xl">
        <PageTitle>Admin</PageTitle>
        <div className="px-4">
          <Routes>
            <Route path={BASE} element={<TjrLayout base={BASE} />}>
              <Route index element={<Desk preview={preview} />} />
              <Route path="runs" element={<Runs preview={preview} />} />
              <Route path="runs/:id" element={<Run preview={preview} />} />
              <Route path="runs/:id/:seq" element={<TradePage preview={preview} />} />
              <Route path="builder" element={<Builder preview={preview} />} />
              <Route path="journal" element={<Journal preview={preview} />} />
              <Route path="setup" element={<Setup preview={preview} />} />
            </Route>
          </Routes>
        </div>
      </div>
    </div></div>
  );
}
