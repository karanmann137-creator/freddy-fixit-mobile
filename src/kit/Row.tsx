// Port of web ui/Sheet.tsx: Group, Sheet (renamed Card: "sheet" means bottom
// sheet on mobile) and Row.
//
// ONE gut. The icon column and the separator inset share t.gut, so a hairline
// can never disagree with the column above it. The icon wrapper renders even
// with no icon, so titles line up down a card.
// Row is pressable only when given onPress.
import React from "react";
import { Pressable, View, type ViewStyle } from "react-native";
import { rgba, ui, useTheme } from "./theme";
import { Txt, isTextLike } from "./Text";
import { Ic, type IconName } from "./Ic";

export function Group({ label, action, children, style }: { label?: string; action?: React.ReactNode; children: React.ReactNode; style?: ViewStyle }) {
  const { t } = useTheme();
  return (
    <View style={[{ marginTop: t.s6 }, style]}>
      {(label || action) && (
        <View style={{ flexDirection: "row", alignItems: "center", gap: t.s2, paddingHorizontal: t.s3, paddingBottom: t.s2 }}>
          {label ? <Txt variant="label" size={0.78} color={rgba(t.muted, 0.78)} ls={0.11} style={{ flex: 1 }} accessibilityRole="header">{label}</Txt> : <View style={{ flex: 1 }} />}
          {action}
        </View>
      )}
      {children}
    </View>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  const { t } = useTheme();
  // Rows get their separators from their index, so wrap children to pass `first`.
  const kids = React.Children.toArray(children);
  return (
    <View style={[{ backgroundColor: t.cardBg, borderWidth: t.hairW, borderColor: t.cardBorder, borderRadius: t.r4, overflow: "hidden" }, style]}>
      {kids.map((k, i) => (React.isValidElement(k) && k.type === Row ? React.cloneElement(k as React.ReactElement<RowProps>, { _first: i === 0 }) : k))}
    </View>
  );
}

export type RowTone = "accent" | "good" | "warn" | "neutral";

type RowProps = {
  icon?: IconName;
  tone?: RowTone;
  title: React.ReactNode;
  sub?: React.ReactNode;
  right?: React.ReactNode;
  amount?: React.ReactNode;
  chevron?: boolean;
  active?: boolean;
  onPress?: () => void;
  testID?: string;
  accessibilityLabel?: string;
  /** internal: set by Card */
  _first?: boolean;
};

export function Row({ icon, tone = "accent", title, sub, right, amount, chevron, active, onPress, testID, accessibilityLabel, _first = true }: RowProps) {
  const { t } = useTheme();
  const iconSkin = {
    accent: { fg: t.accent500, bg: t.accentSoft },
    good: { fg: t.success, bg: rgba(t.successRgb, 0.12) },
    warn: { fg: t.warn, bg: rgba(t.warnRgb, 0.14) },
    neutral: { fg: rgba(t.muted, 0.9), bg: rgba(t.fg, 0.06) },
  }[tone];

  const body = (pressed: boolean) => (
    <View style={{ flexDirection: "row", alignItems: "center", minHeight: t.hRow, paddingVertical: t.s3, paddingHorizontal: t.s4,
      backgroundColor: active ? t.accentSoft : pressed ? rgba(t.fg, 0.05) : "transparent" }}>
      {!_first && <View style={{ position: "absolute", top: 0, left: t.s4 + t.gut, right: 0, height: ui.line, backgroundColor: t.hair }} />}
      <View style={{ width: t.gut }}>
        {icon ? (
          <View style={{ width: ui.rowIcon, height: ui.rowIcon, borderRadius: t.r1, alignItems: "center", justifyContent: "center", backgroundColor: iconSkin.bg }}>
            <Ic name={icon} size={ui.icon.md} color={iconSkin.fg} />
          </View>
        ) : null}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        {isTextLike(title) ? <Txt variant="bodyMedium" size={0.95} numberOfLines={2}>{title}</Txt> : title}
        {sub != null && sub !== false ? (isTextLike(sub) ? <Txt size={0.82} color={rgba(t.muted, 0.92)} style={{ marginTop: ui.nudge }}>{sub}</Txt> : sub) : null}
      </View>
      {(amount || right || chevron) && (
        <View style={{ flexDirection: "row", alignItems: "center", gap: t.s2, marginLeft: t.s3 }}>
          {amount != null && amount !== false ? (isTextLike(amount) ? <Txt variant="label" size={1}>{amount}</Txt> : amount) : null}
          {isTextLike(right) ? <Txt variant="label" size={0.9} color={rgba(t.muted, 0.8)}>{right}</Txt> : right}
          {chevron ? <View style={{ opacity: 0.4 }}><Ic name="chevron-down" size={ui.icon.md} rotate={-90} /></View> : null}
        </View>
      )}
    </View>
  );

  if (!onPress) return <View testID={testID}>{body(false)}</View>;
  return (
    <Pressable testID={testID} onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel} accessibilityState={{ selected: !!active }}>
      {({ pressed }) => body(pressed)}
    </Pressable>
  );
}
