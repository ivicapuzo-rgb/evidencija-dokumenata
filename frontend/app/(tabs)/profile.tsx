import React from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { makeStyles, useTheme } from "@/src/theme";
import { Icon } from "@/src/components/Icon";
import { useAuth } from "@/src/auth/AuthContext";
import { formatDate } from "@/src/utils/docmeta";

export default function Profile() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, logout } = useAuth();

  const doLogout = async () => {
    await logout();
    router.replace("/welcome");
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

        <Pressable testID="profile-subscription-button" style={styles.linkRow} onPress={() => router.push("/(tabs)/subscription")}>
          <Icon name="credit-card-outline" size={22} color={colors.onSurfaceSecondary} />
          <Text style={styles.linkText}>Управљај претплатом</Text>
          <Icon name="chevron-right" size={22} color={colors.muted} />
        </Pressable>

        <Pressable testID="logout-button" style={styles.logoutBtn} onPress={doLogout}>
          <Icon name="logout" size={20} color={colors.error} />
          <Text style={styles.logoutText}>Одјава</Text>
        </Pressable>
      </ScrollView>
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
}));
