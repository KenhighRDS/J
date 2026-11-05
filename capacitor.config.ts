import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.jsignals.app",
  appName: "J",
  webDir: "dist",
  android: { allowMixedContent: false, backgroundColor: "#000000" },
  plugins: {
    SplashScreen: { launchAutoHide: true, launchShowDuration: 600, backgroundColor: "#000000", showSpinner: false, androidScaleType: "CENTER_INSIDE" },
    StatusBar: { style: "DARK", backgroundColor: "#000000", overlaysWebView: false },
  },
};

export default config;
