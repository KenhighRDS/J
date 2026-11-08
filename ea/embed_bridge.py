"""Copies J_Signal.mqh into every EA in source/ between the BEGIN/END markers, so each .mq5 compiles on its own
(no include file to install). Run after editing J_Signal.mqh:  python3 ea/embed_bridge.py"""
import pathlib, re
HERE = pathlib.Path(__file__).parent
BEGIN = "//==== J BRIDGE BEGIN (generated from ea/J_Signal.mqh — edit there, then run ea/embed_bridge.py) ===="
END = "//==== J BRIDGE END ===="
bridge = (HERE / "J_Signal.mqh").read_text(encoding="utf-8").replace("\r\n", "\n").strip("\n")
block = f"{BEGIN}\n{bridge}\n{END}"
for ea in sorted((HERE / "source").glob("*.mq5")):
    raw = ea.read_bytes().decode("utf-8"); crlf = "\r\n" in raw; s = raw.replace("\r\n", "\n")
    if BEGIN in s:
        s = re.sub(re.escape(BEGIN) + r".*?" + re.escape(END), lambda _: block, s, count=1, flags=re.S)
    elif "#include <J_Signal.mqh>" in s:
        s = re.sub(r"#include <J_Signal\.mqh>[^\n]*\n", lambda _: "\n" + block + "\n\n", s, count=1)
    else:
        print("skip (no marker or include):", ea.name); continue
    ea.write_bytes((s.replace("\n", "\r\n") if crlf else s).encode("utf-8")); print("embedded into", ea.name)
