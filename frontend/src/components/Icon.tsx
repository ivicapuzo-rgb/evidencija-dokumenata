import React from "react";
import MDIcon from "@react-native-vector-icons/material-design-icons";

// Thin wrapper so the whole app imports icons from one place.
// Uses Material Design Icons (thousands of glyphs, Cyrillic-agnostic).
export type IconName = React.ComponentProps<typeof MDIcon>["name"];

export function Icon({
  name,
  size = 24,
  color,
}: {
  name: IconName;
  size?: number;
  color: string;
}) {
  return <MDIcon name={name} size={size} color={color} />;
}
