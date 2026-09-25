import React from "react";
import { View, Text, Pressable, ScrollView, ActivityIndicator, RefreshControl } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import { makeStyles, useTheme } from "@/src/theme";
import { Icon, IconName } from "@/src/components/Icon";
import { api, fileUrl } from "@/src/api/client";
import { useToast } from "@/src/components/Toast";
import { formatDate } from "@/src/utils/docmeta";

type Stats = {
  total_users: number;
  online_users: number;
  subscribers: number;
  expiring_subscriptions: number;
  pending_payments: number;
};

type Payment = {
  id: string;
  user_id: string;
  username: string;
  email: string;
  amount_eur: string;
  proof_url: string | null;
  created_at: string;
};

type AdminUser = {
  id: string;
  username: string;
  email: string;
  is_admin: boolean;
  subscription_expires_at: string | null;
  is_subscribed: boolean;
};

export default function Admin() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();

  const statsQ = useQuery({ queryKey: ["admin-stats"], queryFn: () => api<Stats>("/admin/stats") });
  const paymentsQ = useQuery({ queryKey: ["admin-payments"], queryFn: () => api<Payment[]>("/admin/payments") });
  const usersQ = useQuery({ queryKey: ["admin-users"], queryFn: () => api<AdminUser[]>("/admin/users") });

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["admin-stats"] });
    qc.invalidateQueries({ queryKey: ["admin-payments"] });
    qc.invalidateQueries({ queryKey: ["admin-users"] });
  };

  const approveMut = useMutation({
    mutationFn: (id: string) => api(`/admin/payments/${id}/approve`, { method: "POST" }),
    onSuccess: () => {
      invalidateAll();
      toast.show("Уплата потврђена, претплата продужена", "success");
    },
    onError: (e: any) => toast.show(e?.message || "Грешка", "error"),
  });

  const rejectMut = useMutation({
    mutationFn: (id: string) => api(`/admin/payments/${id}/reject`, { method: "POST" }),
    onSuccess: () => {
      invalidateAll();
      toast.show("Уплата одбијена", "info");
    },
  });

  const extendMut = useMutation({
    mutationFn: (id: string) => api(`/admin/users/${id}/extend`, { method: "POST" }),
    onSuccess: () => {
      invalidateAll();
      toast.show("Претплата продужена за 6 месеци", "success");
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api(`/admin/users/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      invalidateAll();
      toast.show("Налог обрисан", "success");
    },
    onError: (e: any) => toast.show(e?.message || "Грешка", "error"),
  });

  const s = statsQ.data;

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.headerTitle}>Админ панел</Text>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={statsQ.isFetching} onRefresh={invalidateAll} tintColor={colors.brandPrimary} />}
      >
        {statsQ.isLoading ? (
          <ActivityIndicator size="large" color={colors.brandPrimary} style={{ marginTop: 40 }} />
        ) : (
          <View style={styles.statsGrid}>
            <StatCard icon="account-group" label="Укупно корисника" value={s?.total_users ?? 0} tint={colors.brandPrimary} />
            <StatCard icon="access-point" label="Онлајн" value={s?.online_users ?? 0} tint={colors.info} />
            <StatCard icon="crown" label="Претплатника" value={s?.subscribers ?? 0} tint={colors.success} />
            <StatCard icon="clock-alert" label="Истичу претплате" value={s?.expiring_subscriptions ?? 0} tint={colors.warning} />
          </View>
        )}

        <Text style={styles.sectionTitle}>Уплате на чекању {s ? `(${s.pending_payments})` : ""}</Text>
        {paymentsQ.data?.length === 0 && <Text style={styles.emptyText}>Нема уплата на чекању.</Text>}
        {paymentsQ.data?.map((p) => (
          <View key={p.id} style={styles.paymentCard} testID={`payment-${p.id}`}>
            <View style={styles.paymentTop}>
              <View style={{ flex: 1 }}>
                <Text style={styles.paymentName}>{p.username}</Text>
                <Text style={styles.paymentEmail}>{p.email}</Text>
                <Text style={styles.paymentDate}>{formatDate(p.created_at)} · {p.amount_eur}€</Text>
              </View>
            </View>
            {p.proof_url && (
              <Image source={{ uri: fileUrl(p.proof_url) }} style={styles.proof} contentFit="cover" />
            )}
            <View style={styles.paymentActions}>
              <Pressable
                testID={`reject-${p.id}`}
                style={[styles.pBtn, styles.rejectBtn]}
                onPress={() => rejectMut.mutate(p.id)}
              >
                <Text style={styles.rejectText}>Одбиј</Text>
              </Pressable>
              <Pressable
                testID={`approve-${p.id}`}
                style={[styles.pBtn, styles.approveBtn]}
                onPress={() => approveMut.mutate(p.id)}
              >
                <Text style={styles.approveText}>Потврди уплату</Text>
              </Pressable>
            </View>
          </View>
        ))}

        <Text style={styles.sectionTitle}>Корисници</Text>
        {usersQ.data?.map((u) => (
          <View key={u.id} style={styles.userCard} testID={`user-${u.id}`}>
            <Pressable style={styles.userMain} onPress={() => router.push({ pathname: "/admin/user/[id]", params: { id: u.id } })}>
              <View style={[styles.userDot, { backgroundColor: u.is_subscribed ? colors.success : colors.muted }]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.userName}>
                  {u.username} {u.is_admin ? "· админ" : ""}
                </Text>
                <Text style={styles.userSub}>Важи до: {formatDate(u.subscription_expires_at)}</Text>
              </View>
              <Icon name="chevron-right" size={20} color={colors.muted} />
            </Pressable>
            <View style={styles.userActions}>
              <Pressable testID={`extend-${u.id}`} style={styles.userActionBtn} onPress={() => extendMut.mutate(u.id)}>
                <Icon name="calendar-plus" size={16} color={colors.brandPrimary} />
                <Text style={styles.userActionText}>+6 месеци</Text>
              </Pressable>
              {!u.is_admin && (
                <Pressable testID={`delete-user-${u.id}`} style={styles.userActionBtn} onPress={() => deleteMut.mutate(u.id)}>
                  <Icon name="account-remove" size={16} color={colors.error} />
                  <Text style={[styles.userActionText, { color: colors.error }]}>Обриши</Text>
                </Pressable>
              )}
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );

  function StatCard({ icon, label, value, tint }: { icon: IconName; label: string; value: number; tint: string }) {
    return (
      <View style={styles.statCard}>
        <View style={[styles.statIcon, { backgroundColor: tint }]}>
          <Icon name={icon} size={20} color="#FFFFFF" />
        </View>
        <Text style={styles.statValue}>{value}</Text>
        <Text style={styles.statLabel}>{label}</Text>
      </View>
    );
  }
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: colors.divider },
  headerTitle: { fontSize: 22, fontWeight: "800", color: colors.onSurface },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  statCard: {
    width: "47%",
    flexGrow: 1,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
  },
  statIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center", marginBottom: 10 },
  statValue: { fontSize: 28, fontWeight: "900", color: colors.onSurface },
  statLabel: { fontSize: 13, color: colors.muted, marginTop: 2, fontWeight: "600" },
  sectionTitle: { fontSize: 17, fontWeight: "800", color: colors.onSurface, marginTop: 26, marginBottom: 12 },
  emptyText: { fontSize: 14, color: colors.muted },
  paymentCard: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginBottom: 12,
  },
  paymentTop: { flexDirection: "row", alignItems: "center" },
  paymentName: { fontSize: 16, fontWeight: "800", color: colors.onSurface },
  paymentEmail: { fontSize: 13, color: colors.muted, marginTop: 2 },
  paymentDate: { fontSize: 13, color: colors.onSurfaceTertiary, marginTop: 4, fontWeight: "600" },
  proof: { width: "100%", height: 160, borderRadius: 12, marginTop: 12, backgroundColor: colors.surfaceTertiary },
  paymentActions: { flexDirection: "row", gap: 10, marginTop: 14 },
  pBtn: { flex: 1, paddingVertical: 13, borderRadius: 999, alignItems: "center" },
  rejectBtn: { backgroundColor: colors.surfaceTertiary },
  rejectText: { color: colors.onSurfaceSecondary, fontWeight: "800", fontSize: 14 },
  approveBtn: { backgroundColor: colors.success },
  approveText: { color: colors.onSuccess, fontWeight: "800", fontSize: 14 },
  userCard: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginBottom: 10,
  },
  userMain: { flexDirection: "row", alignItems: "center", gap: 12 },
  userDot: { width: 10, height: 10, borderRadius: 5 },
  userName: { fontSize: 15, fontWeight: "800", color: colors.onSurface },
  userSub: { fontSize: 13, color: colors.muted, marginTop: 2 },
  userActions: {
    flexDirection: "row",
    gap: 18,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  userActionBtn: { flexDirection: "row", alignItems: "center", gap: 6 },
  userActionText: { fontSize: 13, fontWeight: "700", color: colors.brandPrimary },
}));
