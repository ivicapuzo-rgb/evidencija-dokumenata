import React, { useState } from "react";
import { View, Text, TextInput, Pressable, ActivityIndicator } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { makeStyles, useTheme } from "@/src/theme";
import { Icon } from "@/src/components/Icon";
import { useAuth } from "@/src/auth/AuthContext";
import { useToast } from "@/src/components/Toast";

export default function Register() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { register } = useAuth();
  const toast = useToast();

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!username.trim() || !email.trim() || !password) {
      toast.show("Попуните сва поља", "error");
      return;
    }
    if (password.length < 6) {
      toast.show("Лозинка мора имати најмање 6 карактера", "error");
      return;
    }
    setLoading(true);
    try {
      await register(username.trim(), email.trim(), password);
      router.replace("/(tabs)");
    } catch (e: any) {
      toast.show(e?.message || "Регистрација неуспешна", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.root}>
      <KeyboardAwareScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 32 }]}
        bottomOffset={24}
        showsVerticalScrollIndicator={false}
      >
        <Pressable testID="back-button" style={styles.back} onPress={() => router.back()}>
          <Icon name="chevron-left" size={26} color={colors.onSurface} />
        </Pressable>

        <Text style={styles.title}>Направите налог</Text>
        <Text style={styles.subtitle}>Добијате 14 дана бесплатног пробног периода.</Text>

        <View style={styles.form}>
          <Text style={styles.label}>КОРИСНИЧКО ИМЕ</Text>
          <TextInput
            testID="register-username-input"
            style={styles.input}
            value={username}
            onChangeText={setUsername}
            placeholder="нпр. Иван"
            placeholderTextColor={colors.muted}
            autoCapitalize="words"
          />

          <Text style={styles.label}>ЕМАИЛ АДРЕСА</Text>
          <TextInput
            testID="register-email-input"
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="ime@primer.com"
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
          />

          <Text style={styles.label}>ЛОЗИНКА</Text>
          <View style={styles.passRow}>
            <TextInput
              testID="register-password-input"
              style={styles.passInput}
              value={password}
              onChangeText={setPassword}
              placeholder="најмање 6 карактера"
              placeholderTextColor={colors.muted}
              secureTextEntry={!showPass}
              autoCapitalize="none"
            />
            <Pressable testID="toggle-password" onPress={() => setShowPass((s) => !s)} hitSlop={10}>
              <Icon name={showPass ? "eye-off" : "eye"} size={22} color={colors.muted} />
            </Pressable>
          </View>
        </View>

        <Pressable testID="register-submit-button" style={styles.submit} onPress={submit} disabled={loading}>
          {loading ? (
            <ActivityIndicator color={colors.onBrandPrimary} />
          ) : (
            <Text style={styles.submitText}>РЕГИСТРАЦИЈА</Text>
          )}
        </Pressable>

        <Pressable testID="go-login" style={styles.switch} onPress={() => router.replace("/(auth)/login")}>
          <Text style={styles.switchText}>
            Већ имате налог? <Text style={styles.switchLink}>Пријавите се</Text>
          </Text>
        </Pressable>
      </KeyboardAwareScrollView>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surface },
  content: { paddingHorizontal: 24 },
  back: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.surfaceTertiary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  title: { fontSize: 30, fontWeight: "800", color: colors.onSurface, letterSpacing: -0.5 },
  subtitle: { fontSize: 15, color: colors.muted, marginTop: 8 },
  form: { marginTop: 24, gap: 8 },
  label: { fontSize: 12, fontWeight: "700", color: colors.onSurfaceTertiary, letterSpacing: 0.5, marginTop: 8 },
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
  passRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 14,
    paddingHorizontal: 16,
  },
  passInput: { flex: 1, paddingVertical: 15, fontSize: 16, color: colors.onSurface },
  submit: {
    marginTop: 28,
    backgroundColor: colors.brandPrimary,
    borderRadius: 999,
    paddingVertical: 18,
    alignItems: "center",
  },
  submitText: { color: colors.onBrandPrimary, fontWeight: "800", fontSize: 16, letterSpacing: 0.5 },
  switch: { marginTop: 20, alignItems: "center" },
  switchText: { fontSize: 14, color: colors.muted },
  switchLink: { color: colors.brandPrimary, fontWeight: "700" },
}));
