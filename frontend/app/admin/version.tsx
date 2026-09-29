import React, { useEffect, useState } from "react";
import { View, Text, TextInput, Pressable, Switch, ActivityIndicator } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { makeStyles, useTheme } from "@/src/theme";
import { Icon } from "@/src/components/Icon";
import { api } from "@/src/api/client";
import { useToast } from "@/src/components/Toast";

type Version = {
  version: string;
  versionCode: number;
  apkUrl: string;
  notes: string | null;
  mandatory: boolean;
};

export default function AdminVersion() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();

  const q = useQuery({ queryKey: ["app-version"], queryFn: () => api<Version>("/app/version") });

  const [version, setVersion] = useState("");
  const [versionCode, setVersionCode] = useState("");
  const [apkUrl, setApkUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [mandatory, setMandatory] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (q.data && !hydrated) {
      setVersion(q.data.version);
      setVersionCode(String(q.data.versionCode));
      setApkUrl(q.data.apkUrl);
      setNotes(q.data.notes ?? "");
      setMandatory(q.data.mandatory);
      setHydrated(true);
    }
  }, [q.data, hydrated]);

  const saveMut = useMutation({
    mutationFn: (payload: any) => api("/admin/app-version", { method: "POST", body: payload }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["app-version"] });
      toast.show("Верзија сачувана", "success");
    },
    onError: (e: any) => toast.show(e?.message || "Грешка при чувању", "error"),
  });

  const submit = () => {
    const code = parseInt(versionCode, 10);
    if (!version.trim() || isNaN(code) || !apkUrl.trim()) {
      toast.show("Попуните верзију, код и APK линк", "error");
      return;
    }
    saveMut.mutate({
      version: version.trim(),
      version_code: code,
      apk_url: apkUrl.trim(),
      notes: notes.trim() || null,
      mandatory,
    });
  };

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Pressable testID="back-button" style={styles.backBtn} onPress={() => router.back()}>
          <Icon name="chevron-left" size={26} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>Верзија апликације</Text>
        <View style={{ width: 44 }} />
      </View>

      {q.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.brandPrimary} />
        </View>
      ) : (
        <KeyboardAwareScrollView
          contentContainerStyle={{ padding: 20, paddingBottom: 60 }}
          bottomOffset={24}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.infoCard}>
            <Icon name="information" size={18} color={colors.onBrandTertiary} />
            <Text style={styles.infoText}>
              Ови подаци се сервирају апликацији на `/api/app/version`. Повећајте „Код верзије"
              изнад инсталиране да би корисницима стигао update.
            </Text>
          </View>

          <Text style={styles.label}>ВЕРЗИЈА (нпр. 1.1.0)</Text>
          <TextInput
            testID="version-input"
            style={styles.input}
            value={version}
            onChangeText={setVersion}
            placeholder="1.0.0"
            placeholderTextColor={colors.muted}
          />

          <Text style={styles.label}>КОД ВЕРЗИЈЕ (versionCode)</Text>
          <TextInput
            testID="version-code-input"
            style={styles.input}
            value={versionCode}
            onChangeText={(t) => setVersionCode(t.replace(/\D/g, ""))}
            placeholder="1"
            placeholderTextColor={colors.muted}
            keyboardType="number-pad"
          />

          <Text style={styles.label}>APK ЛИНК (GitHub Releases)</Text>
          <TextInput
            testID="apk-url-input"
            style={[styles.input, styles.multiline]}
            value={apkUrl}
            onChangeText={setApkUrl}
            placeholder="https://github.com/.../releases/latest/download/app.apk"
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
            multiline
          />

          <Text style={styles.label}>НАПОМЕНЕ (шта је ново)</Text>
          <TextInput
            testID="notes-input"
            style={[styles.input, styles.multiline]}
            value={notes}
            onChangeText={setNotes}
            placeholder="Опис измена у овој верзији"
            placeholderTextColor={colors.muted}
            multiline
          />

          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.switchTitle}>Обавезно ажурирање</Text>
              <Text style={styles.switchSub}>Сакрива дугме „Касније" — корисник мора да ажурира.</Text>
            </View>
            <Switch
              testID="mandatory-switch"
              value={mandatory}
              onValueChange={setMandatory}
              trackColor={{ true: colors.brandPrimary, false: colors.borderStrong }}
              thumbColor="#FFFFFF"
            />
          </View>

          <Pressable testID="save-version-button" style={styles.saveBtn} onPress={submit} disabled={saveMut.isPending}>
            {saveMut.isPending ? (
              <ActivityIndicator color={colors.onBrandPrimary} />
            ) : (
              <Text style={styles.saveText}>Сачувај верзију</Text>
            )}
          </Pressable>
        </KeyboardAwareScrollView>
      )}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.surfaceTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { fontSize: 18, fontWeight: "800", color: colors.onSurface },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  infoCard: {
    flexDirection: "row",
    gap: 10,
    backgroundColor: colors.brandTertiary,
    borderRadius: 14,
    padding: 14,
  },
  infoText: { flex: 1, fontSize: 13, color: colors.onBrandTertiary, lineHeight: 19 },
  label: { fontSize: 12, fontWeight: "700", color: colors.onSurfaceTertiary, letterSpacing: 0.5, marginTop: 20, marginBottom: 8 },
  input: {
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: colors.onSurface,
  },
  multiline: { minHeight: 60, textAlignVertical: "top" },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 16,
    marginTop: 22,
  },
  switchTitle: { fontSize: 15, fontWeight: "800", color: colors.onSurface },
  switchSub: { fontSize: 13, color: colors.muted, marginTop: 3, lineHeight: 18 },
  saveBtn: {
    marginTop: 26,
    backgroundColor: colors.brandPrimary,
    borderRadius: 999,
    paddingVertical: 17,
    alignItems: "center",
  },
  saveText: { color: colors.onBrandPrimary, fontWeight: "800", fontSize: 16 },
}));
