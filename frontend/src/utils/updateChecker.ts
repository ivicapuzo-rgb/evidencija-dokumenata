import { Platform } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import * as IntentLauncher from "expo-intent-launcher";
import * as Application from "expo-application";

// version info is served by the backend (/api/app/version) for easy control —
// admins can change version/apkUrl/mandatory without editing files. The app
// pulls all update-check data from here, with a GitHub raw fallback if the
// backend is unreachable.
export const VERSION_URL = `${process.env.EXPO_PUBLIC_BACKEND_URL}/api/app/version`;
export const GITHUB_FALLBACK_URL =
  "https://raw.githubusercontent.com/ivicapuzo-rgb/evidencija-dokumenata/main/version.json";

export type RemoteVersion = {
  version: string;
  versionCode: number;
  apkUrl: string;
  notes?: string;
  mandatory?: boolean;
};

function normalize(data: any): RemoteVersion | null {
  if (!data || typeof data !== "object") return null;

  // GitHub Releases API shape: { tag_name, name, body, assets: [{ name, browser_download_url }] }
  if (data.tag_name || Array.isArray(data.assets)) {
    const assets = Array.isArray(data.assets) ? data.assets : [];
    const apk = assets.find(
      (a: any) =>
        typeof a?.browser_download_url === "string" &&
        a.browser_download_url.toLowerCase().endsWith(".apk"),
    );
    if (!apk) return null;
    return {
      version: String(data.tag_name ?? data.name ?? "").replace(/^v/i, ""),
      versionCode: 0, // no integer code in GitHub releases -> compare by version string
      apkUrl: apk.browser_download_url,
      notes: typeof data.body === "string" ? data.body : undefined,
      mandatory: false,
    };
  }

  // version.json / backend shape (camelCase or snake_case)
  const code = typeof data.versionCode === "number" ? data.versionCode : data.version_code;
  const apkUrl = data.apkUrl ?? data.apk_url;
  if (!apkUrl) return null;
  return {
    version: data.version ?? "",
    versionCode: typeof code === "number" ? code : 0,
    apkUrl,
    notes: data.notes,
    mandatory: !!data.mandatory,
  };
}

async function fetchConfig(url: string): Promise<any | null> {
  try {
    const res = await fetch(`${url}?t=${Date.now()}`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function fetchJson(url: string): Promise<RemoteVersion | null> {
  const data = await fetchConfig(url);
  return normalize(data);
}

export async function fetchRemoteVersion(): Promise<RemoteVersion | null> {
  // 1) backend config (also holds the admin-provided updateUrl)
  const backend = await fetchConfig(VERSION_URL);
  if (backend) {
    const updateUrl = String(backend.updateUrl ?? "").trim();
    // 2) if an update-check link is configured, that link is the source of truth
    if (updateUrl) {
      const fromLink = await fetchJson(updateUrl);
      if (fromLink) return fromLink;
    }
    const normalized = normalize(backend);
    if (normalized) return normalized;
  }
  // 3) GitHub raw fallback when backend is unreachable
  return await fetchJson(GITHUB_FALLBACK_URL);
}

// Android versionCode of the currently installed build.
export function currentVersionCode(): number {
  const raw = Application.nativeBuildVersion ?? "0";
  const n = parseInt(String(raw), 10);
  return isNaN(n) ? 0 : n;
}

// semver-ish compare: >0 if a newer than b
function compareVersions(a: string, b: string): number {
  const pa = String(a).replace(/^v/i, "").split(".").map((n) => parseInt(n, 10) || 0);
  const pb = String(b).replace(/^v/i, "").split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d !== 0) return d > 0 ? 1 : -1;
  }
  return 0;
}

// Returns the remote version info only when a newer APK is available (Android).
export async function checkForApkUpdate(): Promise<RemoteVersion | null> {
  if (Platform.OS !== "android") return null;
  const remote = await fetchRemoteVersion();
  if (!remote) return null;

  const installedCode = currentVersionCode();
  // If both have an integer versionCode, compare those (most reliable).
  if (remote.versionCode > 0 && installedCode > 0) {
    return remote.versionCode > installedCode ? remote : null;
  }
  // Otherwise (e.g. GitHub Releases tag), compare the version string.
  const installedVersion = Application.nativeApplicationVersion ?? "0";
  return compareVersions(remote.version, installedVersion) > 0 ? remote : null;
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
