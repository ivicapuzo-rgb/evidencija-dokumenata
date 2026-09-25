import React, { useState, useMemo } from "react";
import { View, Text, TextInput, Pressable, ActivityIndicator, ScrollView } from "react-native";
import { KeyboardAwareScrollView, KeyboardStickyView } from "react-native-keyboard-controller";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { makeStyles, useTheme } from "@/src/theme";
import { Icon } from "@/src/components/Icon";
import { api } from "@/src/api/client";
import { useToast } from "@/src/components/Toast";
import { DOC_TYPES, ALARM_OPTIONS, maskDate, parseDate, isoToDDMMYYYY } from "@/src/utils/docmeta";

type Doc = {
  id: string;
  name: string;
  doc_type: string;
  expires_at: string;
  alarm_days: number;
};

export default function AddDocument() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const isEdit = !!id;

  const docsQ = useQuery({ queryKey: ["documents"], queryFn: () => api<Doc[]>("/documents"), enabled: isEdit });
  const existing = useMemo(() => docsQ.data?.find((d) => d.id === id), [docsQ.data, id]);

  const [docType, setDocType] = useState("licna_karta");
  const [name, setName] = useState("Лична карта");
  const [dateText, setDateText] = useState("");
  const [alarm, setAlarm] = useState(5);
  const [hydrated, setHydrated] = useState(false);

  // hydrate on edit
  if (isEdit && existing && !hydrated) {
    setDocType(existing.doc_type);
    setName(existing.name);
    setDateText(isoToDDMMYYYY(existing.expires_at));
    setAlarm(existing.alarm_days);
    setHydrated(true);
  }

  const saveMut = useMutation({
    mutationFn: (payload: any) =>
      isEdit
        ? api(`/documents/${id}`, { method: "PUT", body: payload })
        : api("/documents", { method: "POST", body: payload }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["documents"] });
      toast.show(isEdit ? "Документ измењен" : "Документ додат", "success");
      router.back();
    },
    onError: (e: any) => toast.show(e?.message || "Грешка при чувању", "error"),
  });

  const pickType = (key: string, label: string) => {
    setDocType(key);
    if (key !== "custom") setName(label);
    else if (name === "Лична карта" || DOC_TYPES.some((d) => d.label === name)) setName("");
  };

  const submit = () => {
    if (!name.trim()) {
      toast.show("Унесите назив документа", "error");
      return;
    }
    const iso = parseDate(dateText);
    if (!iso) {
      toast.show("Унесите датум у формату ДД.ММ.ГГГГ", "error");
      return;
    }
    saveMut.mutate({ name: name.trim(), doc_type: docType, expires_at: iso, alarm_days: alarm });
  };

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Pressable testID="close-button" style={styles.closeBtn} onPress={() => router.back()}>
          <Icon name="close" size={24} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>{isEdit ? "Измени документ" : "Нови документ"}</Text>
        <View style={{ width: 44 }} />
      </View>

      <KeyboardAwareScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 120 }}
        bottomOffset={90}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.label}>ТИП ДОКУМЕНТА</Text>
        <View style={styles.typeGrid}>
          {DOC_TYPES.map((t) => {
            const active = docType === t.key;
            return (
              <Pressable
                key={t.key}
                testID={`type-${t.key}`}
                style={[styles.typeChip, active && styles.typeChipActive]}
                onPress={() => pickType(t.key, t.label)}
              >
                <Icon name={t.icon} size={20} color={active ? colors.onBrandPrimary : colors.onSurfaceTertiary} />
                <Text style={[styles.typeChipText, active && styles.typeChipTextActive]} numberOfLines={1}>
                  {t.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.label}>НАЗИВ</Text>
        <TextInput
          testID="doc-name-input"
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="нпр. Лична карта"
          placeholderTextColor={colors.muted}
        />

        <Text style={styles.label}>ВАЖИ ДО (ДД.ММ.ГГГГ)</Text>
        <View style={styles.dateRow}>
          <Icon name="calendar" size={20} color={colors.muted} />
          <TextInput
            testID="doc-date-input"
            style={styles.dateInput}
            value={dateText}
            onChangeText={(t) => setDateText(maskDate(t))}
            placeholder="01.02.2028"
            placeholderTextColor={colors.muted}
            keyboardType="number-pad"
            maxLength={10}
          />
        </View>

        <Text style={styles.label}>ОБАВЕСТИ МЕ ПРЕ ИСТЕКА</Text>
        <View style={styles.alarmRow}>
          {ALARM_OPTIONS.map((d) => {
            const active = alarm === d;
            return (
              <Pressable
                key={d}
                testID={`alarm-option-${d}`}
                style={[styles.alarmChip, active && styles.alarmChipActive]}
                onPress={() => setAlarm(d)}
              >
                <Icon name="bell-ring" size={16} color={active ? colors.onBrandPrimary : colors.muted} />
                <Text style={[styles.alarmText, active && styles.alarmTextActive]}>{d} дана</Text>
              </Pressable>
            );
          })}
        </View>
      </KeyboardAwareScrollView>

      <KeyboardStickyView offset={{ closed: 0, opened: insets.bottom }}>
        <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
          <Pressable testID="save-document-button" style={styles.saveBtn} onPress={submit} disabled={saveMut.isPending}>
            {saveMut.isPending ? (
              <ActivityIndicator color={colors.onBrandPrimary} />
            ) : (
              <Text style={styles.saveText}>{isEdit ? "Сачувај измене" : "Сачувај документ"}</Text>
            )}
          </Pressable>
        </View>
      </KeyboardStickyView>
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
  closeBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.surfaceTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { fontSize: 18, fontWeight: "800", color: colors.onSurface },
  label: { fontSize: 12, fontWeight: "700", color: colors.onSurfaceTertiary, letterSpacing: 0.5, marginTop: 22, marginBottom: 10 },
  typeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  typeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  typeChipActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  typeChipText: { fontSize: 13, fontWeight: "700", color: colors.onSurfaceTertiary, maxWidth: 130 },
  typeChipTextActive: { color: colors.onBrandPrimary },
  input: {
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 15,
    fontSize: 16,
    color: colors.onSurface,
  },
  dateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 14,
    paddingHorizontal: 16,
  },
  dateInput: { flex: 1, paddingVertical: 15, fontSize: 16, color: colors.onSurface },
  alarmRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  alarmChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 999,
    backgroundColor: colors.surfaceTertiary,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  alarmChipActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  alarmText: { fontSize: 13, fontWeight: "700", color: colors.onSurfaceTertiary },
  alarmTextActive: { color: colors.onBrandPrimary },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  saveBtn: {
    backgroundColor: colors.brandPrimary,
    borderRadius: 999,
    paddingVertical: 17,
    alignItems: "center",
  },
  saveText: { color: colors.onBrandPrimary, fontWeight: "800", fontSize: 16 },
}));
