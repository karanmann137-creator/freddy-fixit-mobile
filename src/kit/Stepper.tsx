// Port of web ui/Stepper.tsx: the vertical job timeline. 18px node, 1.5px rail.
// "now" is the accent dot: it's the step that's live. "review" is amber.
import React from "react";
import { View } from "react-native";
import { rgba, useTheme } from "./theme";
import { Txt } from "./Text";
import { Ic } from "./Ic";

export type StepState = "done" | "now" | "todo" | "review";
export type Step = { title: React.ReactNode; sub?: React.ReactNode; state: StepState };

const LABEL: Record<StepState, string> = { done: "done", now: "current step", todo: "not started", review: "in review" };

export function Stepper({ steps }: { steps: Step[] }) {
  const { t } = useTheme();
  return (
    <View style={{ paddingVertical: t.s2 }}>
      {steps.map((s, i) => {
        const last = i === steps.length - 1;
        const dot = {
          done: { backgroundColor: t.success },
          now: { backgroundColor: t.accent500, borderWidth: 4, borderColor: t.accentSoft, width: 26, height: 26, margin: -4 },
          review: { backgroundColor: t.warn, borderWidth: 4, borderColor: rgba(t.warnRgb, 0.16), width: 26, height: 26, margin: -4 },
          todo: { borderWidth: 1.5, borderColor: t.hair },
        }[s.state];
        return (
          <View key={i} accessible accessibilityLabel={`${typeof s.title === "string" ? s.title : "Step"}, ${LABEL[s.state]}`}
            style={{ flexDirection: "row", gap: t.s3, paddingVertical: t.s3, paddingHorizontal: t.s4 }}>
            {!last && <View style={{ position: "absolute", left: t.s4 + 9 - 0.75, width: 1.5, top: 34, bottom: -10, backgroundColor: t.hair }} />}
            <View style={{ width: 18, alignItems: "center", marginTop: 2 }}>
              <View style={[{ width: 18, height: 18, borderRadius: 99, alignItems: "center", justifyContent: "center" }, dot]}>
                {s.state === "done" && <Ic name="check" size={11} color={t.surface0e} />}
              </View>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              {typeof s.title === "string"
                ? <Txt variant={s.state === "todo" ? "body" : "bodyMedium"} size={0.92} color={s.state === "todo" ? rgba(t.muted, 0.78) : t.text}>{s.title}</Txt>
                : s.title}
              {s.sub ? (typeof s.sub === "string" ? <Txt size={0.8} color={rgba(t.muted, 0.9)} style={{ marginTop: 1 }}>{s.sub}</Txt> : s.sub) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}
