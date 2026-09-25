import React from "react";
import { Platform } from "react-native";
import { Tabs } from "expo-router";
import { useTheme } from "@/src/theme";
import { Icon, IconName } from "@/src/components/Icon";
import { useAuth } from "@/src/auth/AuthContext";

function tabIcon(name: IconName) {
  return ({ color, size }: { color: string; size: number }) => <Icon name={name} size={size} color={color} />;
}

export default function TabsLayout() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const isAdmin = !!user?.is_admin;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brandPrimary,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          backgroundColor: colors.surfaceSecondary,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          ...(Platform.OS === "web" ? { height: 64 } : {}),
        },
        tabBarItemStyle: { alignSelf: "center" },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "700" },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: "Документа", tabBarIcon: tabIcon("file-document-multiple") }}
      />
      <Tabs.Screen
        name="subscription"
        options={{ title: "Претплата", tabBarIcon: tabIcon("crown") }}
      />
      <Tabs.Screen
        name="admin"
        options={{
          title: "Админ",
          tabBarIcon: tabIcon("shield-account"),
          href: isAdmin ? "/(tabs)/admin" : null,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: "Профил", tabBarIcon: tabIcon("account-circle") }}
      />
    </Tabs>
  );
}
