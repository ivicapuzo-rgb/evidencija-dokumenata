import React, { createContext, useCallback, useContext, useRef, useState } from "react";
import { Text, View, StyleSheet, Animated, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { makeStyles, useTheme } from "@/src/theme";
import { Icon, IconName } from "@/src/components/Icon";

type ToastType = "success" | "error" | "info";
type ToastCtx = { show: (message: string, type?: ToastType) => void };

const Ctx = createContext<ToastCtx | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [message, setMessage] = useState("");
  const [type, setType] = useState<ToastType>("info");
  const [visible, setVisible] = useState(false);
  const opacity = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback(
    (msg: string, t: ToastType = "info") => {
      setMessage(msg);
      setType(t);
      setVisible(true);
      Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: Platform.OS !== "web" }).start();
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        Animated.timing(opacity, { toValue: 0, duration: 220, useNativeDriver: Platform.OS !== "web" }).start(
          () => setVisible(false),
        );
      }, 2800);
    },
    [opacity],
  );

  const bg =
    type === "success" ? colors.success : type === "error" ? colors.error : colors.surfaceInverse;
  const fg =
    type === "success" ? colors.onSuccess : type === "error" ? colors.onError : colors.onSurfaceInverse;
  const iconName: IconName = type === "success" ? "check-circle" : type === "error" ? "alert-circle" : "information";

  return (
    <Ctx.Provider value={{ show }}>
      {children}
      {visible && (
        <Animated.View
          pointerEvents="none"
          style={[styles.wrap, { top: insets.top + 12, opacity }]}
          testID="toast"
        >
          <View style={[styles.toast, { backgroundColor: bg }]}>
            <Icon name={iconName} size={20} color={fg} />
            <Text style={[styles.text, { color: fg }]}>{message}</Text>
          </View>
        </Animated.View>
      )}
    </Ctx.Provider>
  );
}

export function useToast() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

const useStyles = makeStyles((colors) => ({
  wrap: {
    position: "absolute",
    left: 16,
    right: 16,
    alignItems: "center",
    zIndex: 9999,
  },
  toast: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 14,
    maxWidth: 520,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  text: { flex: 1, fontSize: 14, fontWeight: "600" },
}));
