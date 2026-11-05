import { forwardRef, type ReactNode } from "react";

export type ShareFormat = "post" | "story";
export const shareSize: Record<ShareFormat, { w: number; h: number }> = { post: { w: 1080, h: 1350 }, story: { w: 1080, h: 1920 } };

/** Offscreen branded canvas (black, faded logo, chrome numbers). Rendered with html-to-image at exact pixel size. */
export const ShareCard = forwardRef<HTMLDivElement, { format: ShareFormat; logo?: string; footer?: string; children: ReactNode }>(function ShareCard({ format, logo = "/icons/icon-512.png", footer = "J signals", children }, ref) {
  const { w, h } = shareSize[format];
  return (
    <div ref={ref} aria-hidden style={{ width: w, height: h, position: "fixed", left: -20000, top: 0, background: "#000", color: "#F5F5F7", fontFamily: "'Inter Variable', Inter, system-ui, sans-serif", overflow: "hidden" }}>
      <img src={logo} alt="" style={{ position: "absolute", width: w * 0.9, height: w * 0.9, left: w * 0.05, top: (h - w * 0.9) / 2, opacity: 0.12, objectFit: "contain" }} />
      <div style={{ position: "absolute", inset: 0, padding: 88, display: "flex", flexDirection: "column" }}>
        {children}
        <div style={{ marginTop: "auto", fontSize: 30, color: "#8E8E93", letterSpacing: 0.5 }}>{footer}</div>
      </div>
    </div>
  );
});

export const chromeText: React.CSSProperties = { background: "linear-gradient(180deg,#fff 0%,#BFC3C9 55%,#6E7279 100%)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" };
