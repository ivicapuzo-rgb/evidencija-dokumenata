import { Platform } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import * as IntentLauncher from "expo-intent-launcher";
import * as Application from "expo-application";

// version info is served by the backend (/api/app/version) for easy control —
// admins can change version/apkUrl/mandatory without editing files. The app
// pulls all update-check data from here.
export const VERSION_URL = `${process.env.EXPO_PUBLIC_BACKEND_URL}/api/app/version`;

export type RemoteVersion = {
  version: string;
  versionCode: number;
  apkUrl: string;
  notes?: string;
  mandatory?: boolean;
};

export async function fetchRemoteVersion(): Promise<RemoteVersion | null> {
  try {
    const res = await fetch(`${VERSION_URL}?t=${Date.now()}`);
    if (!res.ok) return null;
    const data = await res.json();
    if (typeof data?.versionCode !== "number" || !data?.apkUrl) return null;
    return data as RemoteVersion;
  } catch {
    return null;
  }
}

// Android versionCode of the currently installed build.
export function currentVersionCode(): number {
  const raw = Application.nativeBuildVersion ?? "0";
  const n = parseInt(String(raw), 10);
  return isNaN(n) ? 0 : n;
}

// Returns the remote version info only when a newer APK is available (Android).
export async function checkForApkUpdate(): Promise<RemoteVersion | null> {
  if (Platform.OS !== "android") return null;
  const remote = await fetchRemoteVersion();
  if (!remote) return null;
  return remote.versionCode > currentVersionCode() ? remote : null;
}

// Downloads the APK to the cache dir and launches the Android package installer.
export async function downloadAndInstallApk(
  remote: RemoteVersion,
  onProgress?: (ratio: number) => void,
): Promise<void> {
  const target = `${FileSystem.cacheDirectory}update-${remote.versionCode}.apk`;
  try {
    await FileSystem.deleteAsync(target, { idempotent: true });
  } catch {
    /* ignore */
  }

  const task = FileSystem.createDownloadResumable(remote.apkUrl, target, {}, (p) => {
    if (onProgress && p.totalBytesExpectedToWrite > 0) {
      onProgress(p.totalBytesWritten / p.totalBytesExpectedToWrite);
    }
  });

  const result = await task.downloadAsync();
  if (!result?.uri) throw new Error("Преузимање APK-а није успело");

  // content:// URI so the installer (another app) can read our file
  const contentUri = await FileSystem.getContentUriAsync(result.uri);
  await IntentLauncher.startActivityAsync("android.intent.action.INSTALL_PACKAGE", {
    data: contentUri,
    flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
  });
}
