import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, Pressable, Modal, ActivityIndicator, StyleSheet, AppState } from "react-native";
import * as Updates from "expo-updates";
import { makeStyles, useTheme } from "@/src/theme";
import { Icon } from "@/src/components/Icon";

// Silently checks for a new OTA version on launch and whenever the app returns
// to the foreground. If one is found it is downloaded in the background and a
// friendly modal is shown. "Ажурирај сада" reloads into the new version.
export function UpdatePrompt() {
  const styles = useStyles();
  const { colors } = useTheme();
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const checking = useRef(false);

  const check = useCallback(async () => {
    // expo-updates is only active in a real build (not Expo Go / dev)
    if (!Updates.isEnabled || __DEV__ || checking.current) return;
    checking.current = true;
    try {
      const result = await Updates.checkForUpdateAsync();
      if (result.isAvailable) {
        await Updates.fetchUpdateAsync();
        setVisible(true);
      }
    } catch {
      /* offline or no update server — ignore silently */
    } finally {
      checking.current = false;
    }
  }, []);

  useEffect(() => {
    check();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") check();
    });
    return () => sub.remove();
  }, [check]);

  const applyUpdate = async () => {
    setBusy(true);
    try {
      await Updates.reloadAsync();
    } catch {
      setBusy(false);
      setVisible(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)}>
      <View style={styles.backdrop}>
        <View style={styles.card} testID="update-prompt">
          <View style={styles.iconWrap}>
            <Icon name="rocket-launch" size={30} color={colors.onBrandPrimary} />
          </View>
          <Text style={styles.title}>Нова верзија је спремна</Text>
          <Text style={styles.subtitle}>
            Преузели смо најновију верзију апликације. Ажурирајте сада да добијете најновије
            измене и исправке.
          </Text>

          <Pressable testID="update-now-button" style={styles.primaryBtn} onPress={applyUpdate} disabled={busy}>
            {busy ? (
              <ActivityIndicator color={colors.onBrandPrimary} />
            ) : (
              <Text style={styles.primaryText}>Ажурирај сада</Text>
            )}
          </Pressable>

          <Pressable testID="update-later-button" style={styles.secondaryBtn} onPress={() => setVisible(false)} disabled={busy}>
            <Text style={styles.secondaryText}>Касније</Text>
          </Pressable>
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
    marginBottom: 18,
  },
  title: { fontSize: 21, fontWeight: "800", color: colors.onSurface, textAlign: "center" },
  subtitle: { fontSize: 15, color: colors.muted, textAlign: "center", marginTop: 10, lineHeight: 22 },
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
