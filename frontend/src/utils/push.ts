import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { api } from "@/src/api/client";

// Registers this device for push. Call after login and on every app open.
export async function registerForPush(userId: string) {
  if (Platform.OS === "web") return;
  try {
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== "granted") return;
    const tokenResp = await Notifications.getDevicePushTokenAsync();
    await api("/register-push", {
      method: "POST",
      auth: false,
      body: { user_id: userId, platform: Platform.OS, device_token: tokenResp.data },
    });
  } catch {
    /* non-blocking */
  }
}
