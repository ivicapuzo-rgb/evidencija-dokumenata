import React from "react";
import { View, Text, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import { makeStyles, useTheme } from "@/src/theme";
import { Icon } from "@/src/components/Icon";
import { api, fileUrl } from "@/src/api/client";
import { useToast } from "@/src/components/Toast";
import { docIcon, statusFor, formatDate } from "@/src/utils/docmeta";

type Detail = {
  user: {
    id: string;
    username: string;
    email: string;
    is_admin: boolean;
    subscription_expires_at: string | null;
    is_subscribed: boolean;
  };
  documents: { id: string; name: string; doc_type: string; expires_at: string; alarm_days: number; days_remaining: number }[];
  payments: { id: string; status: string; amount_eur: string; proof_url: string | null; created_at: string }[];
};

export default function UserDetail() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();

  const q = useQuery({ queryKey: ["admin-user", id], queryFn: () => api<Detail>(`/admin/users/${id}`) });

  const extendMut = useMutation({
    mutationFn: () => api(`/admin/users/${id}/extend`, { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-user", id] });
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      toast.show("Претплата продужена за 6 месеци", "success");
    },
  });

  const deleteMut = useMutation({
    mutationFn: () => api(`/admin/users/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      qc.invalidateQueries({ queryKey: ["admin-stats"] });
      toast.show("Налог обрисан", "success");
      router.back();
    },
    onError: (e: any) => toast.show(e?.message || "Грешка", "error"),
  });

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Pressable testID="back-button" style={styles.backBtn} onPress={() => router.back()}>
          <Icon name="chevron-left" size={26} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>Налог корисника</Text>
        <View style={{ width: 44 }} />
      </View>

      {q.isLoading || !q.data ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.brandPrimary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
          <View style={styles.userCard}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{q.data.user.username[0]?.toUpperCase()}</Text>
            </View>
            <Text style={styles.name}>{q.data.user.username}</Text>
            <Text style={styles.email}>{q.data.user.email}</Text>
            <View style={[styles.statusPill, { backgroundColor: q.data.user.is_subscribed ? colors.success : colors.error }]}>
              <Text style={styles.statusPillText}>
                {q.data.user.is_subscribed ? "Претплата активна" : "Претплата истекла"}
              </Text>
            </View>
            <Text style={styles.validText}>Важи до: {formatDate(q.data.user.subscription_expires_at)}</Text>
          </View>

          <View style={styles.actionsRow}>
            <Pressable testID="extend-user-button" style={styles.extendBtn} onPress={() => extendMut.mutate()}>
              <Icon name="calendar-plus" size={18} color={colors.onBrandPrimary} />
              <Text style={styles.extendText}>Продужи +6 месеци</Text>
            </Pressable>
            {!q.data.user.is_admin && (
              <Pressable testID="delete-user-button" style={styles.delBtn} onPress={() => deleteMut.mutate()}>
                <Icon name="trash-can-outline" size={18} color={colors.error} />
              </Pressable>
            )}
          </View>

          <Text style={styles.sectionTitle}>Документа ({q.data.documents.length})</Text>
          {q.data.documents.length === 0 && <Text style={styles.emptyText}>Нема докумената.</Text>}
          {q.data.documents.map((d) => {
            const st = statusFor(d.days_remaining, colors);
            return (
              <View key={d.id} style={styles.docRow}>
                <View style={styles.docIcon}>
                  <Icon name={docIcon(d.doc_type)} size={20} color={colors.onBrandTertiary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.docName}>{d.name}</Text>
                  <Text style={styles.docValid}>Важи до: {formatDate(d.expires_at)}</Text>
                </View>
                <View style={[styles.chip, { backgroundColor: st.bg }]}>
                  <Text style={[styles.chipText, { color: st.color }]}>{st.label}</Text>
                </View>
              </View>
            );
          })}

          <Text style={styles.sectionTitle}>Историја уплата ({q.data.payments.length})</Text>
          {q.data.payments.length === 0 && <Text style={styles.emptyText}>Нема уплата.</Text>}
          {q.data.payments.map((p) => (
            <View key={p.id} style={styles.payRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.payAmount}>{p.amount_eur}€</Text>
                <Text style={styles.payDate}>{formatDate(p.created_at)}</Text>
              </View>
              {p.proof_url && (
                <Image source={{ uri: fileUrl(p.proof_url) }} style={styles.payProof} contentFit="cover" />
              )}
              <View style={[styles.payStatus, { backgroundColor: statusColor(p.status, colors) }]}>
                <Text style={styles.payStatusText}>{statusLabel(p.status)}</Text>
              </View>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

function statusLabel(s: string) {
  return s === "approved" ? "Потврђено" : s === "rejected" ? "Одбијено" : "На чекању";
}
function statusColor(s: string, colors: any) {
  return s === "approved" ? colors.success : s === "rejected" ? colors.error : colors.warning;
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
  userCard: { alignItems: "center", paddingVertical: 10 },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 24,
    backgroundColor: colors.brandPrimary,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: colors.onBrandPrimary, fontSize: 34, fontWeight: "800" },
  name: { fontSize: 20, fontWeight: "800", color: colors.onSurface, marginTop: 12 },
  email: { fontSize: 14, color: colors.muted, marginTop: 2 },
  statusPill: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 999, marginTop: 12 },
  statusPillText: { color: "#FFFFFF", fontWeight: "800", fontSize: 13 },
  validText: { fontSize: 13, color: colors.onSurfaceTertiary, marginTop: 8, fontWeight: "600" },
  actionsRow: { flexDirection: "row", gap: 10, marginTop: 18 },
  extendBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.brandPrimary,
    borderRadius: 999,
    paddingVertical: 15,
  },
  extendText: { color: colors.onBrandPrimary, fontWeight: "800", fontSize: 15 },
  delBtn: {
    width: 52,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: colors.error,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionTitle: { fontSize: 16, fontWeight: "800", color: colors.onSurface, marginTop: 26, marginBottom: 12 },
  emptyText: { fontSize: 14, color: colors.muted },
  docRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    marginBottom: 10,
  },
  docIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: colors.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  docName: { fontSize: 15, fontWeight: "800", color: colors.onSurface },
  docValid: { fontSize: 12, color: colors.muted, marginTop: 2 },
  chip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  chipText: { fontSize: 12, fontWeight: "800" },
  payRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    marginBottom: 10,
  },
  payAmount: { fontSize: 15, fontWeight: "800", color: colors.onSurface },
  payDate: { fontSize: 12, color: colors.muted, marginTop: 2 },
  payProof: { width: 44, height: 44, borderRadius: 10, backgroundColor: colors.surfaceTertiary },
  payStatus: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  payStatusText: { fontSize: 11, fontWeight: "800", color: "#FFFFFF" },
}));
