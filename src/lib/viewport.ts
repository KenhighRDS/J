/** iOS reports a wrong viewport height on first paint in the installed app, so the root is sized from JS. */
export function installAppHeight(): void {
  const set = () => {
    const h = window.visualViewport?.height ?? window.innerHeight;
    document.documentElement.style.setProperty("--app-h", `${Math.round(h)}px`);
  };
  set();
  window.setTimeout(set, 250);
  window.setTimeout(set, 1000);
  window.addEventListener("resize", set);
  window.addEventListener("orientationchange", set);
  window.visualViewport?.addEventListener("resize", set);
}
