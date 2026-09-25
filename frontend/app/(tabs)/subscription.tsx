import React, { useState } from "react";
import { View, Text, Pressable, ScrollView, ActivityIndicator, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import * as Clipboard from "expo-clipboard";
import { Image } from "expo-image";
import { makeStyles, useTheme } from "@/src/theme";
import { Icon } from "@/src/components/Icon";
import { api, fileUrl } from "@/src/api/client";
import { useToast } from "@/src/components/Toast";
import { useAuth } from "@/src/auth/AuthContext";
import { formatDate } from "@/src/utils/docmeta";

type Sub = {
  price_eur: string;
  months: number;
  iban: string;
  beneficiary: string;
  subscription_expires_at: string | null;
  is_subscribed: boolean;
  pending_payment: { id: string; status: string; proof_url: string | null; created_at: string } | null;
};

export default function Subscription() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const qc = useQueryClient();
  const { refresh } = useAuth();
  const [uploading, setUploading] = useState(false);

  const subQ = useQuery({ queryKey: ["subscription"], queryFn: () => api<Sub>("/subscription") });

  const claimMut = useMutation({
    mutationFn: (proofUrl?: string) =>
      api(`/subscription/claim${proofUrl ? `?proof_url=${encodeURIComponent(proofUrl)}` : ""}`, { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["subscription"] });
      toast.show("Пријава уплате послата. Админ ће потврдити.", "success");
    },
    onError: (e: any) => toast.show(e?.message || "Грешка", "error"),
  });

  const copyIban = async () => {
    if (subQ.data?.iban) {
      await Clipboard.setStringAsync(subQ.data.iban);
      toast.show("IBAN копиран", "success");
    }
  };

  const uploadProof = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      toast.show("Потребна дозвола за галерију", "error");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.6,
    });
    if (result.canceled || !result.assets?.length) return;
    const asset = result.assets[0];
    setUploading(true);
    try {
      const form = new FormData();
      const name = asset.fileName || `proof-${Date.now()}.jpg`;
      const type = asset.mimeType || "image/jpeg";
      if (Platform.OS === "web") {
        const blob = await (await fetch(asset.uri)).blob();
        form.append("file", blob, name);
      } else {
        form.append("file", { uri: asset.uri, name, type } as any);
      }
      const res = await api<{ path: string; url: string }>("/upload", { method: "POST", body: form, isForm: true });
      claimMut.mutate(res.url);
    } catch (e: any) {
      toast.show(e?.message || "Отпремање неуспешно", "error");
    } finally {
      setUploading(false);
    }
  };

  if (subQ.isLoading || !subQ.data) {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator size="large" color={colors.brandPrimary} />
      </View>
    );
  }

  const sub = subQ.data;
  const pending = sub.pending_payment;

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.headerTitle}>Претплата</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        <View style={styles.statusCard}>
          <View style={[styles.statusIcon, { backgroundColor: sub.is_subscribed ? colors.success : colors.error }]}>
            <Icon name={sub.is_subscribed ? "check-decagram" : "alert-circle"} size={28} color="#FFFFFF" />
          </View>
          <Text style={styles.statusTitle}>{sub.is_subscribed ? "Претплата активна" : "Претплата истекла"}</Text>
          <Text style={styles.statusDate}>Важи до: {formatDate(sub.subscription_expires_at)}</Text>
        </View>

        <View style={styles.priceCard}>
          <Text style={styles.priceValue}>{sub.price_eur}€</Text>
          <Text style={styles.pricePeriod}>на сваких {sub.months} месеци</Text>
        </View>

        {pending && (
          <View style={styles.pendingCard} testID="pending-card">
            <Icon name="clock-outline" size={20} color={colors.onWarning} />
            <Text style={styles.pendingText}>
              Ваша пријава уплате је послата и чека потврду администратора.
            </Text>
          </View>
        )}

        <Text style={styles.sectionTitle}>Подаци за уплату</Text>
        <View style={styles.ibanCard}>
          <View style={styles.ibanRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.ibanLabel}>IBAN РАЧУН</Text>
              <Text style={styles.ibanValue} testID="iban-value">{sub.iban}</Text>
            </View>
            <Pressable testID="copy-iban-button" style={styles.copyBtn} onPress={copyIban}>
              <Icon name="content-copy" size={18} color={colors.brandPrimary} />
            </Pressable>
          </View>
          <View style={styles.ibanDivider} />
          <Text style={styles.ibanLabel}>ПРИМАЛАЦ</Text>
          <Text style={styles.ibanSub}>{sub.beneficiary}</Text>
          <Text style={[styles.ibanLabel, { marginTop: 12 }]}>ИЗНОС</Text>
          <Text style={styles.ibanSub}>{sub.price_eur}€ / {sub.months} месеци</Text>
        </View>

        <View style={styles.stepsCard}>
          <Step n="1" text="Уплатите износ на наведени IBAN рачун" />
          <Step n="2" text="Отпремите доказ о уплати (опционо)" />
          <Step n="3" text="Означите „Уплатио сам“ — админ потврђује и продужава претплату за 6 месеци" />
        </View>

        {pending?.proof_url && (
          <Image source={{ uri: fileUrl(pending.proof_url) }} style={styles.proofPreview} contentFit="cover" />
        )}

        <Pressable testID="upload-proof-button" style={styles.uploadBtn} onPress={uploadProof} disabled={uploading}>
          {uploading ? (
            <ActivityIndicator color={colors.brandPrimary} />
          ) : (
            <>
              <Icon name="upload" size={20} color={colors.brandPrimary} />
              <Text style={styles.uploadText}>Учитај доказ о уплати</Text>
            </>
          )}
        </Pressable>

        <Pressable
          testID="mark-paid-button"
          style={styles.paidBtn}
          onPress={() => claimMut.mutate(undefined)}
          disabled={claimMut.isPending}
        >
          {claimMut.isPending ? (
            <ActivityIndicator color={colors.onBrandPrimary} />
          ) : (
            <Text style={styles.paidText}>Уплатио сам</Text>
          )}
        </Pressable>
      </ScrollView>
    </View>
  );

  function Step({ n, text }: { n: string; text: string }) {
    return (
      <View style={styles.step}>
        <View style={styles.stepNum}>
          <Text style={styles.stepNumText}>{n}</Text>
        </View>
        <Text style={styles.stepText}>{text}</Text>
      </View>
    );
  }
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surface },
  center: { alignItems: "center", justifyContent: "center" },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  headerTitle: { fontSize: 22, fontWeight: "800", color: colors.onSurface },
  statusCard: {
    alignItems: "center",
    backgroundColor: colors.surfaceSecondary,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 22,
    marginTop: 6,
  },
  statusIcon: { width: 60, height: 60, borderRadius: 18, alignItems: "center", justifyContent: "center", marginBottom: 12 },
  statusTitle: { fontSize: 18, fontWeight: "800", color: colors.onSurface },
  statusDate: { fontSize: 14, color: colors.muted, marginTop: 4 },
  priceCard: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.brandTertiary,
    borderRadius: 18,
    paddingVertical: 18,
    marginTop: 14,
  },
  priceValue: { fontSize: 36, fontWeight: "900", color: colors.onBrandTertiary },
  pricePeriod: { fontSize: 15, fontWeight: "700", color: colors.onBrandTertiary },
  pendingCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.warning,
    borderRadius: 16,
    padding: 14,
    marginTop: 14,
  },
  pendingText: { flex: 1, fontSize: 13, fontWeight: "600", color: colors.onWarning, lineHeight: 18 },
  sectionTitle: { fontSize: 17, fontWeight: "800", color: colors.onSurface, marginTop: 24, marginBottom: 12 },
  ibanCard: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 18,
  },
  ibanRow: { flexDirection: "row", alignItems: "center" },
  ibanLabel: { fontSize: 11, fontWeight: "800", color: colors.muted, letterSpacing: 0.5 },
  ibanValue: { fontSize: 17, fontWeight: "800", color: colors.onSurface, marginTop: 4, letterSpacing: 0.5 },
  ibanSub: { fontSize: 15, fontWeight: "600", color: colors.onSurfaceSecondary, marginTop: 4 },
  copyBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  ibanDivider: { height: 1, backgroundColor: colors.divider, marginVertical: 14 },
  stepsCard: { marginTop: 18, gap: 14 },
  step: { flexDirection: "row", alignItems: "center", gap: 12 },
  stepNum: {
    width: 30,
    height: 30,
    borderRadius: 999,
    backgroundColor: colors.brandPrimary,
    alignItems: "center",
    justifyContent: "center",
  },
  stepNumText: { color: colors.onBrandPrimary, fontWeight: "800", fontSize: 14 },
  stepText: { flex: 1, fontSize: 14, color: colors.onSurfaceSecondary, lineHeight: 20 },
  proofPreview: { width: "100%", height: 180, borderRadius: 16, marginTop: 18, backgroundColor: colors.surfaceTertiary },
  uploadBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 20,
    paddingVertical: 15,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: colors.brandPrimary,
  },
  uploadText: { color: colors.brandPrimary, fontWeight: "800", fontSize: 15 },
  paidBtn: {
    marginTop: 12,
    backgroundColor: colors.brandPrimary,
    borderRadius: 999,
    paddingVertical: 17,
    alignItems: "center",
  },
  paidText: { color: colors.onBrandPrimary, fontWeight: "800", fontSize: 16 },
}));
