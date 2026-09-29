import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, Pressable, Modal, ActivityIndicator, AppState } from "react-native";
import { makeStyles, useTheme } from "@/src/theme";
import { Icon } from "@/src/components/Icon";
import {
  checkForApkUpdate,
  downloadAndInstallApk,
  RemoteVersion,
} from "@/src/utils/updateChecker";

// Self-hosted APK auto-update. Checks version.json (on GitHub) at launch and on
// every foreground; if a newer APK exists it shows this modal, downloads the
// APK and launches the Android installer — no Play Store needed. Android-only,
// active only in a real build (Application.nativeBuildVersion is set there).
export function ApkUpdatePrompt() {
  const styles = useStyles();
  const { colors } = useTheme();
  const [remote, setRemote] = useState<RemoteVersion | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const checking = useRef(false);

  const check = useCallback(async () => {
    if (checking.current || __DEV__) return;
    checking.current = true;
    try {
      const found = await checkForApkUpdate();
      if (found) setRemote(found);
    } catch {
      /* ignore */
    } finally {
      checking.current = false;
    }
  }, []);

  useEffect(() => {
    check();
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") check();
    });
    return () => sub.remove();
  }, [check]);

  const install = async () => {
    if (!remote) return;
    setBusy(true);
    setError(null);
    setProgress(0);
    try {
      await downloadAndInstallApk(remote, setProgress);
      // installer takes over from here
    } catch (e: any) {
      setError(e?.message || "Ажурирање није успело");
      setBusy(false);
    }
  };

  if (!remote) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => !remote.mandatory && setRemote(null)}>
      <View style={styles.backdrop}>
        <View style={styles.card} testID="apk-update-prompt">
          <View style={styles.iconWrap}>
            <Icon name="download-circle" size={30} color={colors.onBrandPrimary} />
          </View>
          <Text style={styles.title}>Доступна је нова верзија</Text>
          <Text style={styles.version}>Верзија {remote.version}</Text>
          {!!remote.notes && <Text style={styles.notes}>{remote.notes}</Text>}

          {busy ? (
            <View style={styles.progressWrap}>
              <View style={styles.progressTrack}>
                <View style={[styles.progressBar, { width: `${Math.round(progress * 100)}%` }]} />
              </View>
              <Text style={styles.progressText}>
                {progress > 0 ? `Преузимање… ${Math.round(progress * 100)}%` : "Припрема…"}
              </Text>
            </View>
          ) : null}

          {!!error && <Text style={styles.error}>{error}</Text>}

          <Pressable testID="apk-update-now" style={styles.primaryBtn} onPress={install} disabled={busy}>
            {busy ? (
              <ActivityIndicator color={colors.onBrandPrimary} />
            ) : (
              <Text style={styles.primaryText}>Ажурирај сада</Text>
            )}
          </Pressable>

          {!remote.mandatory && (
            <Pressable testID="apk-update-later" style={styles.secondaryBtn} onPress={() => setRemote(null)} disabled={busy}>
              <Text style={styles.secondaryText}>Касније</Text>
            </Pressable>
          )}
        </View>
      </View>
    </Modal>
  );
}

const useStyles = makeStyles((colors) => ({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
    padding: 28,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: colors.surface,
    borderRadius: 26,
    padding: 26,
    alignItems: "center",
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: colors.brandPrimary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  title: { fontSize: 21, fontWeight: "800", color: colors.onSurface, textAlign: "center" },
  version: { fontSize: 14, color: colors.brandPrimary, fontWeight: "700", marginTop: 4 },
  notes: { fontSize: 14, color: colors.muted, textAlign: "center", marginTop: 10, lineHeight: 21 },
  progressWrap: { width: "100%", marginTop: 20 },
  progressTrack: { height: 8, borderRadius: 999, backgroundColor: colors.surfaceTertiary, overflow: "hidden" },
  progressBar: { height: 8, borderRadius: 999, backgroundColor: colors.brandPrimary },
  progressText: { fontSize: 13, color: colors.muted, marginTop: 8, textAlign: "center" },
  error: { fontSize: 13, color: colors.error, marginTop: 14, textAlign: "center" },
  primaryBtn: {
    width: "100%",
    backgroundColor: colors.brandPrimary,
    borderRadius: 999,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 24,
  },
  primaryText: { color: colors.onBrandPrimary, fontWeight: "800", fontSize: 16 },
  secondaryBtn: { width: "100%", paddingVertical: 14, alignItems: "center", marginTop: 6 },
  secondaryText: { color: colors.muted, fontWeight: "700", fontSize: 15 },
}));
