# Load HistData XAUUSD M1 (EST, no DST), convert to broker server time (New York + 7h: GMT+2 winter / GMT+3 summer), cache as parquet-ish npz.
import glob, os, numpy as np, pandas as pd
import sys
D = sys.argv[1] if len(sys.argv) > 1 else "data"   # folder with DAT_MT_XAUUSD_M1_*.csv (HistData, e.g. huggingface.co/datasets/fokan/xauusd-2009-2026)
out = os.path.join(D, "m1_server.npz")
frames = []
for f in sorted(glob.glob(os.path.join(D, "DAT_MT_XAUUSD_M1_*.csv"))):
    df = pd.read_csv(f, header=None, names=["d", "t", "o", "h", "l", "c", "v"], dtype={"d": str, "t": str})
    frames.append(df)
df = pd.concat(frames, ignore_index=True)
ts = pd.to_datetime(df["d"] + " " + df["t"], format="%Y.%m.%d %H:%M")
utc = (ts + pd.Timedelta(hours=5)).dt.tz_localize("UTC")
server = utc.dt.tz_convert("America/New_York").dt.tz_localize(None) + pd.Timedelta(hours=7)
df = pd.DataFrame({"time": server.values, "o": df.o.values, "h": df.h.values, "l": df.l.values, "c": df.c.values}).drop_duplicates("time").sort_values("time").reset_index(drop=True)
np.savez_compressed(out, time=df.time.values.astype("datetime64[m]").astype(np.int64), o=df.o.values, h=df.h.values, l=df.l.values, c=df.c.values)
print(len(df), df.time.iloc[0], df.time.iloc[-1])
