import React, { useEffect, useState } from "react";
import { Platform, View, Text, Pressable, StyleSheet } from "react-native";
import { Stack, useRouter } from "expo-router";
import { LogBox } from "react-native";
import * as Notifications from "expo-notifications";
import * as Linking from "expo-linking";
import { QueryClientProvider } from "@tanstack/react-query";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";

import { ErrorBoundary } from "@/src/components/error-boundary";
import { queryClient } from "@/src/query-client";
import { AuthProvider } from "@/src/auth/AuthContext";
import { ToastProvider } from "@/src/components/Toast";
import { storage } from "@/src/utils/storage";
import { Icon } from "@/src/components/Icon";
import { UpdatePrompt } from "@/src/components/UpdatePrompt";

LogBox.ignoreAllLogs(true);

// 1. Foreground handler — MODULE SCOPE
if (Platform.OS !== "web") {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

// 2. Android channel — MODULE SCOPE
if (Platform.OS === "android") {
  Notifications.setNotificationChannelAsync("default", {
    name: "Обавештења",
    importance: Notifications.AndroidImportance.MAX,
    sound: "default",
  });
}

function NotificationGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [showNudge, setShowNudge] = useState(false);

  useEffect(() => {
    if (Platform.OS === "web") return;

    const tapSub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data: any = response.notification.request.content.data || {};
      const url = data.deeplink || data.action_url;
      if (!url) return;
      url.startsWith("http") ? Linking.openURL(url) : router.push(url);
    });

    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!response) return;
      const data: any = response.notification.request.content.data || {};
      const url = data.deeplink || data.action_url;
      if (url) {
        url.startsWith("http") ? Linking.openURL(url) : router.push(url);
      }
    });

    (async () => {
      const { status, canAskAgain } = await Notifications.getPermissionsAsync();
      if (status !== "denied" || canAskAgain) return;
      const lastNudge = await storage.getItem<number>("pushNudgeAt", 0);
      const oneWeek = 7 * 24 * 60 * 60 * 1000;
      if (lastNudge && Date.now() - Number(lastNudge) <= oneWeek) return;
      setShowNudge(true);
    })();

    return () => {
      tapSub.remove();
    };
  }, [router]);

  const dismissNudge = async (openSettings: boolean) => {
    await storage.setItem("pushNudgeAt", Date.now());
    setShowNudge(false);
    if (openSettings) Linking.openSettings();
  };

  return (
    <>
      {children}
      {showNudge && (
        <View style={[nudgeStyles.wrap, { bottom: insets.bottom + 16 }]} testID="push-nudge">
          <View style={nudgeStyles.card}>
            <Icon name="bell-ring" size={22} color="#EA580C" />
            <Text style={nudgeStyles.text}>
              Укључите обавештења да вас алармирамо пре истека докумената.
            </Text>
            <View style={nudgeStyles.actions}>
              <Pressable onPress={() => dismissNudge(false)} testID="nudge-later">
                <Text style={nudgeStyles.later}>Касније</Text>
              </Pressable>
              <Pressable onPress={() => dismissNudge(true)} testID="nudge-settings" style={nudgeStyles.settingsBtn}>
                <Text style={nudgeStyles.settingsText}>Подеси</Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}
    </>
  );
}

export default function RootLayout() {
  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <QueryClientProvider client={queryClient}>
            <KeyboardProvider>
              <AuthProvider>
                <ToastProvider>
                  <NotificationGate>
                    <StatusBar style="dark" />
                    <Stack screenOptions={{ headerShown: false }}>
                      <Stack.Screen name="document/add" options={{ presentation: "modal" }} />
                    </Stack>
                    <UpdatePrompt />
                  </NotificationGate>
                </ToastProvider>
              </AuthProvider>
            </KeyboardProvider>
          </QueryClientProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}

const nudgeStyles = StyleSheet.create({
  wrap: { position: "absolute", left: 16, right: 16, zIndex: 9998 },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 16,
    gap: 10,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  text: { fontSize: 14, color: "#1C1917", lineHeight: 20 },
  actions: { flexDirection: "row", justifyContent: "flex-end", alignItems: "center", gap: 16 },
  later: { fontSize: 14, color: "#78716C", fontWeight: "600" },
  settingsBtn: { backgroundColor: "#EA580C", paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999 },
  settingsText: { color: "#FFFFFF", fontWeight: "700", fontSize: 14 },
});
