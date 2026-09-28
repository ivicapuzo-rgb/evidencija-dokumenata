import React, { useEffect, useState } from "react";
import { View, Text, Pressable, ScrollView, Modal, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";
import { makeStyles, useTheme } from "@/src/theme";
import { Icon } from "@/src/components/Icon";
import { useAuth } from "@/src/auth/AuthContext";
import { useToast } from "@/src/components/Toast";
import { formatDate } from "@/src/utils/docmeta";
import {
  getReminderTime,
  setReminderTime,
  syncDocReminders,
  DEFAULT_REMINDER_TIME,
  DocLite,
} from "@/src/utils/localNotifications";

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = [0, 15, 30, 45];
const PRESETS = ["07:00", "08:00", "09:00", "12:00", "18:00", "20:00"];

export default function Profile() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, logout, deleteAccount } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();

  const [reminder, setReminder] = useState(DEFAULT_REMINDER_TIME);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [draftHour, setDraftHour] = useState(9);
  const [draftMinute, setDraftMinute] = useState(0);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    getReminderTime().then(setReminder);
  }, []);

  const openPicker = () => {
    const [h, m] = reminder.split(":").map((n) => parseInt(n, 10));
    setDraftHour(isNaN(h) ? 9 : h);
    setDraftMinute(isNaN(m) ? 0 : m);
    setPickerOpen(true);
  };

  const saveTime = async () => {
    const value = `${String(draftHour).padStart(2, "0")}:${String(draftMinute).padStart(2, "0")}`;
    setReminder(value);
    await setReminderTime(value);
    setPickerOpen(false);
    const docs = qc.getQueryData<DocLite[]>(["documents"]);
    if (docs) await syncDocReminders(docs);
    toast.show(`Подсетници стижу у ${value}`, "success");
  };

  const doLogout = async () => {
    await logout();
    router.replace("/welcome");
  };

  const confirmDelete = async () => {
    setDeleting(true);
    try {
      await deleteAccount();
      qc.clear();
      setDeleteOpen(false);
      router.replace("/welcome");
    } catch (e: any) {
      setDeleting(false);
      toast.show(e?.message || "Брисање неуспешно", "error");
    }
  };

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.headerTitle}>Профил</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        <View style={styles.avatarCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{user?.username?.[0]?.toUpperCase() ?? "?"}</Text>
          </View>
          <Text style={styles.name}>{user?.username}</Text>
          <Text style={styles.email}>{user?.email}</Text>
          {user?.is_admin && (
            <View style={styles.adminBadge}>
              <Icon name="shield-check" size={14} color={colors.onBrandPrimary} />
              <Text style={styles.adminBadgeText}>Администратор</Text>
            </View>
          )}
        </View>

        <View style={styles.infoRow}>
          <View style={styles.infoIcon}>
            <Icon name={user?.is_subscribed ? "crown" : "crown-outline"} size={22} color={colors.brandPrimary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.infoLabel}>Статус претплате</Text>
            <Text style={styles.infoValue}>{user?.is_subscribed ? "Активна" : "Истекла"}</Text>
          </View>
        </View>

        <View style={styles.infoRow}>
          <View style={styles.infoIcon}>
            <Icon name="calendar-check" size={22} color={colors.brandPrimary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.infoLabel}>Претплата важи до</Text>
            <Text style={styles.infoValue}>{formatDate(user?.subscription_expires_at)}</Text>
          </View>
        </View>

        <Pressable testID="reminder-time-button" style={styles.infoRow} onPress={openPicker}>
          <View style={styles.infoIcon}>
            <Icon name="clock-outline" size={22} color={colors.brandPrimary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.infoLabel}>Време подсетника</Text>
            <Text style={styles.infoValue} testID="reminder-time-value">{reminder}</Text>
          </View>
          <Icon name="pencil" size={20} color={colors.muted} />
        </Pressable>

        <Pressable testID="profile-subscription-button" style={styles.linkRow} onPress={() => router.push("/(tabs)/subscription")}>
          <Icon name="credit-card-outline" size={22} color={colors.onSurfaceSecondary} />
          <Text style={styles.linkText}>Управљај претплатом</Text>
          <Icon name="chevron-right" size={22} color={colors.muted} />
        </Pressable>

        <Pressable testID="logout-button" style={styles.logoutBtn} onPress={doLogout}>
          <Icon name="logout" size={20} color={colors.error} />
          <Text style={styles.logoutText}>Одјава</Text>
        </Pressable>

        <Pressable testID="delete-account-button" style={styles.deleteRow} onPress={() => setDeleteOpen(true)}>
          <Text style={styles.deleteRowText}>Обриши налог</Text>
        </Pressable>
      </ScrollView>

      <Modal visible={pickerOpen} transparent animationType="slide" onRequestClose={() => setPickerOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setPickerOpen(false)} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 20 }]} testID="reminder-picker">
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>Време подсетника</Text>
          <Text style={styles.sheetSub}>Изаберите у колико сати желите да стигне подсетник.</Text>

          <Text style={styles.pickerBig} testID="reminder-draft">
            {String(draftHour).padStart(2, "0")}:{String(draftMinute).padStart(2, "0")}
          </Text>

          <Text style={styles.pickerLabel}>БРЗИ ИЗБОР</Text>
          <View style={styles.presetRow}>
            {PRESETS.map((p) => {
              const active = `${String(draftHour).padStart(2, "0")}:${String(draftMinute).padStart(2, "0")}` === p;
              return (
                <Pressable
                  key={p}
                  testID={`preset-${p}`}
                  style={[styles.presetChip, active && styles.chipActive]}
                  onPress={() => {
                    const [h, m] = p.split(":").map(Number);
                    setDraftHour(h);
                    setDraftMinute(m);
                  }}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{p}</Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.pickerLabel}>САТ</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipScroll}>
            {HOURS.map((h) => (
              <Pressable
                key={h}
                testID={`hour-${h}`}
                style={[styles.timeChip, draftHour === h && styles.chipActive]}
                onPress={() => setDraftHour(h)}
              >
                <Text style={[styles.chipText, draftHour === h && styles.chipTextActive]}>
                  {String(h).padStart(2, "0")}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          <Text style={styles.pickerLabel}>МИНУТ</Text>
          <View style={styles.presetRow}>
            {MINUTES.map((m) => (
              <Pressable
                key={m}
                testID={`minute-${m}`}
                style={[styles.timeChip, draftMinute === m && styles.chipActive]}
                onPress={() => setDraftMinute(m)}
              >
                <Text style={[styles.chipText, draftMinute === m && styles.chipTextActive]}>
                  {String(m).padStart(2, "0")}
                </Text>
              </Pressable>
            ))}
          </View>

          <Pressable testID="save-reminder-time" style={styles.saveBtn} onPress={saveTime}>
            <Text style={styles.saveText}>Сачувај</Text>
          </Pressable>
        </View>
      </Modal>

      <Modal visible={deleteOpen} transparent animationType="fade" onRequestClose={() => setDeleteOpen(false)}>
        <View style={styles.centerBackdrop}>
          <View style={styles.confirmCard} testID="delete-account-modal">
            <View style={styles.confirmIcon}>
              <Icon name="alert" size={28} color={colors.onError} />
            </View>
            <Text style={styles.confirmTitle}>Обриши налог?</Text>
            <Text style={styles.confirmSub}>
              Ова радња трајно уклања ваш налог и сва документа. Не може се опозвати.
            </Text>
            <Pressable testID="confirm-delete-account" style={styles.confirmDeleteBtn} onPress={confirmDelete} disabled={deleting}>
              {deleting ? (
                <ActivityIndicator color={colors.onError} />
              ) : (
                <Text style={styles.confirmDeleteText}>Да, обриши налог</Text>
              )}
            </Pressable>
            <Pressable testID="cancel-delete-account" style={styles.confirmCancelBtn} onPress={() => setDeleteOpen(false)} disabled={deleting}>
              <Text style={styles.confirmCancelText}>Откажи</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: colors.divider },
  headerTitle: { fontSize: 22, fontWeight: "800", color: colors.onSurface },
  avatarCard: { alignItems: "center", paddingVertical: 20 },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 28,
    backgroundColor: colors.brandPrimary,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: colors.onBrandPrimary, fontSize: 38, fontWeight: "800" },
  name: { fontSize: 22, fontWeight: "800", color: colors.onSurface, marginTop: 14 },
  email: { fontSize: 14, color: colors.muted, marginTop: 4 },
  adminBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.brandPrimary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    marginTop: 12,
  },
  adminBadgeText: { color: colors.onBrandPrimary, fontWeight: "700", fontSize: 12 },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginTop: 12,
  },
  infoIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  infoLabel: { fontSize: 12, color: colors.muted, fontWeight: "600" },
  infoValue: { fontSize: 16, fontWeight: "800", color: colors.onSurface, marginTop: 2 },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginTop: 12,
  },
  linkText: { flex: 1, fontSize: 15, fontWeight: "700", color: colors.onSurfaceSecondary },
  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 24,
    paddingVertical: 16,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: colors.error,
  },
  logoutText: { color: colors.error, fontWeight: "800", fontSize: 16 },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)" },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  sheetHandle: {
    width: 44,
    height: 5,
    borderRadius: 999,
    backgroundColor: colors.borderStrong,
    alignSelf: "center",
    marginBottom: 16,
  },
  sheetTitle: { fontSize: 20, fontWeight: "800", color: colors.onSurface },
  sheetSub: { fontSize: 14, color: colors.muted, marginTop: 4 },
  pickerBig: {
    fontSize: 46,
    fontWeight: "900",
    color: colors.brandPrimary,
    textAlign: "center",
    marginVertical: 16,
    letterSpacing: 1,
  },
  pickerLabel: { fontSize: 12, fontWeight: "800", color: colors.onSurfaceTertiary, letterSpacing: 0.5, marginTop: 14, marginBottom: 8 },
  presetRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chipScroll: { gap: 8, paddingRight: 8 },
  presetChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: colors.surfaceTertiary,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  timeChip: {
    minWidth: 52,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: colors.surfaceTertiary,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: "center",
  },
  chipActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  chipText: { fontSize: 15, fontWeight: "700", color: colors.onSurfaceTertiary },
  chipTextActive: { color: colors.onBrandPrimary },
  saveBtn: {
    marginTop: 24,
    backgroundColor: colors.brandPrimary,
    borderRadius: 999,
    paddingVertical: 17,
    alignItems: "center",
  },
  saveText: { color: colors.onBrandPrimary, fontWeight: "800", fontSize: 16 },
  deleteRow: { alignItems: "center", paddingVertical: 16, marginTop: 6 },
  deleteRowText: { color: colors.error, fontWeight: "700", fontSize: 14 },
  centerBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
    padding: 28,
  },
  confirmCard: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: colors.surface,
    borderRadius: 26,
    padding: 26,
    alignItems: "center",
  },
  confirmIcon: {
    width: 60,
    height: 60,
    borderRadius: 18,
    backgroundColor: colors.error,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  confirmTitle: { fontSize: 20, fontWeight: "800", color: colors.onSurface, textAlign: "center" },
  confirmSub: { fontSize: 14, color: colors.muted, textAlign: "center", marginTop: 10, lineHeight: 21 },
  confirmDeleteBtn: {
    width: "100%",
    backgroundColor: colors.error,
    borderRadius: 999,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 22,
  },
  confirmDeleteText: { color: colors.onError, fontWeight: "800", fontSize: 16 },
  confirmCancelBtn: { width: "100%", paddingVertical: 14, alignItems: "center", marginTop: 4 },
  confirmCancelText: { color: colors.muted, fontWeight: "700", fontSize: 15 },
}));
