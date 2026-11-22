// Text with the brand faces and the user's text-size setting.
// `label` = Bebas Neue (headings, labels, chips, numerals, buttons). Bebas has
// one weight; never pass fontWeight with it, or Android fakes a bold.
import React from "react";
import { Text as RNText, type TextProps, type TextStyle } from "react-native";
import { fonts, useFs, useTheme } from "./theme";

type Variant = "body" | "bodyMedium" | "bodyBold" | "label" | "display";

export function Txt({ variant = "body", size, color, style, ...rest }: TextProps & { variant?: Variant; size?: number; color?: string }) {
  const { t } = useTheme();
  const fs = useFs();
  const base: TextStyle = {
    fontFamily: fonts[variant],
    fontSize: fs(size ?? (variant === "label" ? 0.95 : 1)),
    color: color ?? t.text,
    ...(variant === "label" ? { letterSpacing: fs(size ?? 0.95) * 0.09 } : null),
  };
  return <RNText {...rest} style={[base, style]} />;
}
