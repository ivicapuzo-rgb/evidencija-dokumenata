import React from "react";
import { View, Text, Pressable, ScrollView, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { makeStyles, useTheme } from "@/src/theme";
import { Icon } from "@/src/components/Icon";
import { DOC_TYPES } from "@/src/utils/docmeta";

const PREVIEW = ["licna_karta", "pasos", "vozacka"];

export default function Welcome() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.badge}>
          <Icon name="bell-alert" size={18} color={colors.onBrandTertiary} />
          <Text style={styles.badgeText}>Аларм за истек докумената</Text>
        </View>

        <Text style={styles.title}>Евиденција{"\n"}докумената</Text>
        <Text style={styles.subtitle}>
          Апликација вас алармира на време када истичу ваша лична документа — лична карта, пасош,
          возачка и све што сами додате.
        </Text>

        <View style={styles.previewRow}>
          {PREVIEW.map((k) => {
            const meta = DOC_TYPES.find((d) => d.key === k)!;
            return (
              <View key={k} style={styles.previewCard}>
                <View style={styles.previewIcon}>
                  <Icon name={meta.icon} size={22} color={colors.onBrandTertiary} />
                </View>
                <Text style={styles.previewLabel} numberOfLines={2}>
                  {meta.label}
                </Text>
                <View style={styles.previewLine} />
                <Text style={styles.previewValid}>Важи до: 01.02.2028.</Text>
              </View>
            );
          })}
        </View>

        <View style={styles.features}>
          <Feature icon="calendar-clock" text="Одаберите аларм: 2, 5, 10 или 15 дана пре истека" />
          <Feature icon="bell-ring" text="Пуш обавештење стиже право на ваш телефон" />
          <Feature icon="card-plus" text="Направите сопствену картицу и назовите је како желите" />
        </View>

        <Pressable
          testID="welcome-register-button"
          style={styles.registerBtn}
          onPress={() => router.push("/(auth)/register")}
        >
          <LinearGradient
            colors={[colors.brandPrimary, "#F97316"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.registerGrad}
          >
            <Text style={styles.registerText}>РЕГИСТРАЦИЈА</Text>
          </LinearGradient>
        </Pressable>

        <Pressable testID="welcome-login-button" style={styles.loginBtn} onPress={() => router.push("/(auth)/login")}>
          <Text style={styles.loginText}>ПРИЈАВА</Text>
        </Pressable>
      </ScrollView>
    </View>
  );

  function Feature({ icon, text }: { icon: any; text: string }) {
    return (
      <View style={styles.feature}>
        <View style={styles.featureIcon}>
          <Icon name={icon} size={18} color={colors.brandPrimary} />
        </View>
        <Text style={styles.featureText}>{text}</Text>
      </View>
    );
  }
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surface },
  content: { paddingHorizontal: 24 },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 8,
    backgroundColor: colors.brandTertiary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
  },
  badgeText: { color: colors.onBrandTertiary, fontWeight: "700", fontSize: 13 },
  title: { fontSize: 40, fontWeight: "800", color: colors.onSurface, marginTop: 20, lineHeight: 44, letterSpacing: -0.5 },
  subtitle: { fontSize: 15, color: colors.muted, marginTop: 12, lineHeight: 22 },
  previewRow: { flexDirection: "row", gap: 10, marginTop: 24 },
  previewCard: {
    flex: 1,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
  },
  previewIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  previewLabel: { fontSize: 12, fontWeight: "700", color: colors.onSurface, minHeight: 30 },
  previewLine: { height: 1, backgroundColor: colors.border, marginVertical: 8 },
  previewValid: { fontSize: 9, color: colors.error, fontWeight: "600" },
  features: { marginTop: 28, gap: 14 },
  feature: { flexDirection: "row", alignItems: "center", gap: 12 },
  featureIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  featureText: { flex: 1, fontSize: 14, color: colors.onSurfaceSecondary, lineHeight: 20 },
  registerBtn: { marginTop: 32, borderRadius: 999, overflow: "hidden" },
  registerGrad: { paddingVertical: 18, alignItems: "center" },
  registerText: { color: colors.onBrandPrimary, fontWeight: "800", fontSize: 16, letterSpacing: 0.5 },
  loginBtn: {
    marginTop: 14,
    paddingVertical: 16,
    alignItems: "center",
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
  },
  loginText: { color: colors.onSurface, fontWeight: "800", fontSize: 16, letterSpacing: 0.5 },
}));
