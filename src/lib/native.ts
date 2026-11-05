// Bridge to the Android JAlert plugin (native call-style alerts). No-ops on web.
import { registerPlugin, type PluginListenerHandle } from "@capacitor/core";
import { isAndroidNative } from "./platform";

export interface PermissionStatus { notifications: boolean; fullScreen: boolean; overlay: boolean; battery: boolean; dnd: boolean; samsung: boolean }
export interface JAlertPlugin {
  getToken(): Promise<{ token: string; deviceSecret: string }>;
  getPermissions(): Promise<PermissionStatus>;
  openPermission(o: { which: "notifications" | "fullScreen" | "overlay" | "battery" | "dnd" | "samsung" }): Promise<void>;
  requestNotifications(): Promise<{ granted: boolean }>;
  testAlert(o: { delaySec: number }): Promise<void>;
  stopRinging(o: { signalId?: string }): Promise<void>;
  setServer(o: { functionsUrl: string; anonKey: string; deviceId: string }): Promise<void>;
  consumeLaunchRoute(): Promise<{ route: string | null }>;
  addListener(event: "token" | "signal", cb: (data: { token?: string; route?: string; data?: Record<string, string> }) => void): Promise<PluginListenerHandle>;
}
export const JAlert = registerPlugin<JAlertPlugin>("JAlert");
export const hasNativeAlerts = isAndroidNative;
