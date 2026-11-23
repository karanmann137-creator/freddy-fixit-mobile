// Port of web ui/Stepper.tsx: the vertical job timeline. 18px node, 1.5px rail.
// "now" is the accent dot: it's the step that's live. "review" is amber.
import React from "react";
import { View } from "react-native";
import { rgba, ui, useTheme } from "./theme";
import { Txt, isTextLike } from "./Text";
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
          now: { backgroundColor: t.accent500, borderWidth: ui.stepRing, borderColor: t.accentSoft, width: ui.stepDot + 2 * ui.stepRing, height: ui.stepDot + 2 * ui.stepRing, margin: -ui.stepRing },
          review: { backgroundColor: t.warn, borderWidth: ui.stepRing, borderColor: rgba(t.warnRgb, 0.16), width: ui.stepDot + 2 * ui.stepRing, height: ui.stepDot + 2 * ui.stepRing, margin: -ui.stepRing },
          todo: { borderWidth: ui.stepRail, borderColor: t.hair },
        }[s.state];
        return (
          <View key={i} accessible={isTextLike(s.title)}
            accessibilityLabel={isTextLike(s.title) ? [s.title, isTextLike(s.sub) ? s.sub : null, LABEL[s.state]].filter((x) => x != null && x !== "").join(", ") : undefined}
            style={{ flexDirection: "row", gap: t.s3, paddingVertical: t.s3, paddingHorizontal: t.s4 }}>
            {!last && <View style={{ position: "absolute", left: t.s4 + ui.stepDot / 2 - ui.stepRail / 2, width: ui.stepRail, top: ui.stepRailTop, bottom: -t.s3, backgroundColor: t.hair }} />}
            <View style={{ width: ui.stepDot, alignItems: "center", marginTop: ui.nudge2 }}>
              <View style={[{ width: ui.stepDot, height: ui.stepDot, borderRadius: ui.pill, alignItems: "center", justifyContent: "center" }, dot]}>
                {s.state === "done" && <Ic name="check" size={ui.icon.xs} color={t.surface0e} />}
              </View>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              {isTextLike(s.title)
                ? <Txt variant={s.state === "todo" ? "body" : "bodyMedium"} size={0.92} color={s.state === "todo" ? rgba(t.muted, 0.78) : t.text}>{s.title}</Txt>
                : <>{s.title}<Txt style={{ position: "absolute", opacity: 0 }} accessibilityLabel={LABEL[s.state]}>{LABEL[s.state]}</Txt></>}
              {s.sub != null ? (isTextLike(s.sub) ? <Txt size={0.8} color={rgba(t.muted, 0.9)} style={{ marginTop: ui.nudge }}>{s.sub}</Txt> : s.sub) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}
