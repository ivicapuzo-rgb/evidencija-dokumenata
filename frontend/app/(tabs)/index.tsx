import React, { useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { makeStyles, useTheme } from "@/src/theme";
import { Icon } from "@/src/components/Icon";
import { api } from "@/src/api/client";
import { useAuth } from "@/src/auth/AuthContext";
import { useToast } from "@/src/components/Toast";
import { ALARM_OPTIONS, docIcon, statusFor, formatDate } from "@/src/utils/docmeta";

type Doc = {
  id: string;
  name: string;
  doc_type: string;
  expires_at: string;
  alarm_days: number;
  days_remaining: number;
};

type Sub = { subscription_expires_at: string | null; is_subscribed: boolean };

export default function Documents() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();

  const docsQ = useQuery({ queryKey: ["documents"], queryFn: () => api<Doc[]>("/documents") });
  const subQ = useQuery({ queryKey: ["subscription"], queryFn: () => api<Sub>("/subscription") });

  const alarmMut = useMutation({
    mutationFn: ({ id, alarm_days }: { id: string; alarm_days: number }) =>
      api(`/documents/${id}`, { method: "PUT", body: { alarm_days } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["documents"] }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api(`/documents/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["documents"] });
      toast.show("Документ обрисан", "success");
    },
  });

  const onRefresh = useCallback(() => {
    docsQ.refetch();
    subQ.refetch();
  }, [docsQ, subQ]);

  const renderHeader = () => {
    const sub = subQ.data;
    const expired = sub && !sub.is_subscribed;
    return (
      <View style={styles.listHeader}>
        <Pressable
          testID="subscription-banner"
          style={[styles.subBanner, expired && styles.subBannerExpired]}
          onPress={() => router.push("/(tabs)/subscription")}
        >
          <View style={styles.subIcon}>
            <Icon name={expired ? "alert-circle" : "crown"} size={22} color={expired ? colors.onError : colors.onWarning} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.subLabel}>{expired ? "ПРЕТПЛАТА ИСТЕКЛА" : "ПРЕПЛАТА ВАЖИ ДО"}</Text>
            <Text style={styles.subDate}>
              {sub?.subscription_expires_at ? formatDate(sub.subscription_expires_at) : "—"}
            </Text>
          </View>
          <Icon name="chevron-right" size={22} color={expired ? colors.onError : colors.onWarning} />
        </Pressable>

        <Text style={styles.sectionTitle}>Моја документа</Text>
      </View>
    );
  };

  const renderCard = ({ item }: { item: Doc }) => {
    const st = statusFor(item.days_remaining, colors);
    return (
      <View style={styles.card} testID={`document-card-${item.id}`}>
        <View style={styles.cardTop}>
          <View style={styles.cardIcon}>
            <Icon name={docIcon(item.doc_type)} size={24} color={colors.onBrandTertiary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardName} numberOfLines={1}>
              {item.name}
            </Text>
            <Text style={styles.cardValid}>Важи до: {formatDate(item.expires_at)}</Text>
          </View>
          <View style={[styles.statusChip, { backgroundColor: st.bg }]}>
            <Text style={[styles.statusText, { color: st.color }]}>{st.label}</Text>
          </View>
        </View>

        <Text style={styles.alarmLabel}>Обавести ме за:</Text>
        <View style={styles.alarmRow}>
          {ALARM_OPTIONS.map((d) => {
            const active = item.alarm_days === d;
            return (
              <Pressable
                key={d}
                testID={`alarm-${item.id}-${d}`}
                style={[styles.alarmChip, active && styles.alarmChipActive]}
                onPress={() => alarmMut.mutate({ id: item.id, alarm_days: d })}
              >
                <Text style={[styles.alarmChipText, active && styles.alarmChipTextActive]}>{d} дана</Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.cardActions}>
          <Pressable
            testID={`edit-${item.id}`}
            style={styles.actionBtn}
            onPress={() => router.push({ pathname: "/document/add", params: { id: item.id } })}
          >
            <Icon name="pencil" size={16} color={colors.onSurfaceSecondary} />
            <Text style={styles.actionText}>Измени</Text>
          </Pressable>
          <Pressable testID={`delete-${item.id}`} style={styles.actionBtn} onPress={() => deleteMut.mutate(item.id)}>
            <Icon name="trash-can-outline" size={16} color={colors.error} />
            <Text style={[styles.actionText, { color: colors.error }]}>Обриши</Text>
          </Pressable>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <View>
          <Text style={styles.appTitle}>Евиденција</Text>
          <Text style={styles.greeting}>Здраво, {user?.username} 👋</Text>
        </View>
        <View style={styles.headerBell}>
          <Icon name="bell-ring" size={22} color={colors.brandPrimary} />
        </View>
      </View>

      {docsQ.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.brandPrimary} />
        </View>
      ) : docsQ.isError ? (
        <ScrollView
          contentContainerStyle={styles.center}
          refreshControl={<RefreshControl refreshing={false} onRefresh={onRefresh} />}
        >
          <Icon name="cloud-alert" size={48} color={colors.muted} />
          <Text style={styles.emptyTitle}>Грешка при учитавању</Text>
          <Pressable style={styles.retryBtn} onPress={onRefresh} testID="retry-button">
            <Text style={styles.retryText}>Покушај поново</Text>
          </Pressable>
        </ScrollView>
      ) : (
        <FlatList
          data={docsQ.data ?? []}
          keyExtractor={(d) => d.id}
          renderItem={renderCard}
          ListHeaderComponent={renderHeader}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 120 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={docsQ.isFetching} onRefresh={onRefresh} tintColor={colors.brandPrimary} />}
          ListEmptyComponent={
            <View style={styles.emptyWrap} testID="empty-state">
              <View style={styles.emptyIcon}>
                <Icon name="folder-open-outline" size={44} color={colors.brandPrimary} />
              </View>
              <Text style={styles.emptyTitle}>Немате додатих докумената</Text>
              <Text style={styles.emptySub}>Додајте прво документо и подесите аларм пре истека.</Text>
            </View>
          }
        />
      )}

      <Pressable
        testID="add-document-fab"
        style={[styles.fab, { bottom: 16 }]}
        onPress={() => router.push("/document/add")}
      >
        <Icon name="plus" size={26} color={colors.onBrandPrimary} />
        <Text style={styles.fabText}>Додај документ</Text>
      </Pressable>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 14,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  appTitle: { fontSize: 22, fontWeight: "800", color: colors.brandPrimary, letterSpacing: -0.5 },
  greeting: { fontSize: 14, color: colors.muted, marginTop: 2 },
  headerBell: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  listHeader: { paddingTop: 16 },
  subBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.warning,
    borderRadius: 18,
    padding: 16,
  },
  subBannerExpired: { backgroundColor: colors.error },
  subIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.25)",
    alignItems: "center",
    justifyContent: "center",
  },
  subLabel: { fontSize: 11, fontWeight: "800", color: colors.onWarning, letterSpacing: 0.5, opacity: 0.9 },
  subDate: { fontSize: 20, fontWeight: "800", color: colors.onWarning, marginTop: 2 },
  sectionTitle: { fontSize: 17, fontWeight: "800", color: colors.onSurface, marginTop: 24, marginBottom: 4 },
  card: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginTop: 14,
  },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  cardIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: colors.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  cardName: { fontSize: 16, fontWeight: "800", color: colors.onSurface },
  cardValid: { fontSize: 13, color: colors.muted, marginTop: 3 },
  statusChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, minWidth: 60, alignItems: "center" },
  statusText: { fontSize: 13, fontWeight: "800" },
  alarmLabel: { fontSize: 12, fontWeight: "700", color: colors.onSurfaceTertiary, marginTop: 16, marginBottom: 8 },
  alarmRow: { flexDirection: "row", gap: 8 },
  alarmChip: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: colors.surfaceTertiary,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: "center",
  },
  alarmChipActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  alarmChipText: { fontSize: 12, fontWeight: "700", color: colors.onSurfaceTertiary },
  alarmChipTextActive: { color: colors.onBrandPrimary },
  cardActions: {
    flexDirection: "row",
    gap: 20,
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: 6 },
  actionText: { fontSize: 13, fontWeight: "700", color: colors.onSurfaceSecondary },
  center: { flexGrow: 1, alignItems: "center", justifyContent: "center", padding: 40, gap: 14 },
  emptyWrap: { alignItems: "center", justifyContent: "center", paddingVertical: 50, gap: 10 },
  emptyIcon: {
    width: 84,
    height: 84,
    borderRadius: 24,
    backgroundColor: colors.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  emptyTitle: { fontSize: 17, fontWeight: "800", color: colors.onSurface, textAlign: "center" },
  emptySub: { fontSize: 14, color: colors.muted, textAlign: "center", paddingHorizontal: 30 },
  retryBtn: { backgroundColor: colors.brandPrimary, paddingHorizontal: 22, paddingVertical: 12, borderRadius: 999 },
  retryText: { color: colors.onBrandPrimary, fontWeight: "700" },
  fab: {
    position: "absolute",
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.brandPrimary,
    paddingHorizontal: 22,
    paddingVertical: 15,
    borderRadius: 999,
    shadowColor: colors.brandPrimary,
    shadowOpacity: 0.35,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  fabText: { color: colors.onBrandPrimary, fontWeight: "800", fontSize: 15 },
}));
