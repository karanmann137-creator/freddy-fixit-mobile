// Text with the brand faces and the user's text-size setting.
// `label` = Bebas Neue (headings, labels, chips, numerals, buttons). Bebas has
// one weight; never pass fontWeight with it, or Android fakes a bold.
import React from "react";
import { Text as RNText, type TextProps, type TextStyle } from "react-native";
import { fonts, useFs, useTheme } from "./theme";

type Variant = "body" | "bodyMedium" | "bodyBold" | "label" | "display";

/** `lh` = line height as a multiple of the font size, `ls` = letter spacing in em.
 *  Both scale with the text-size setting. A fixed px lineHeight clips text at "Largest". */
/** React Native crashes on a bare string OR number outside <Text>. Anything this says yes to gets wrapped. */
export const isTextLike = (v: unknown): v is string | number => typeof v === "string" || typeof v === "number";

export function Txt({ variant = "body", size, color, lh, ls, style, ...rest }: TextProps & { variant?: Variant; size?: number; color?: string; lh?: number; ls?: number }) {
  const { t } = useTheme();
  const fs = useFs();
  const px = fs(size ?? (variant === "label" ? 0.95 : 1));
  const base: TextStyle = {
    fontFamily: fonts[variant],
    fontSize: px,
    color: color ?? t.text,
    letterSpacing: px * (ls ?? (variant === "label" ? 0.09 : 0)),
    ...(lh ? { lineHeight: Math.round(px * lh) } : null),
  };
  return <RNText {...rest} style={[base, style]} />;
}
