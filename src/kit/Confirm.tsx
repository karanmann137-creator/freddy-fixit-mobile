// askConfirm(): the one "are you sure?" for irreversible actions. Port of web
// components/ConfirmDialog.tsx.
//
//   if (!(await askConfirm({ title, message, confirmLabel: "Pay $120" }))) return;
//
// ⚠️ Web lesson: askConfirm only settles when the dialog closes, so a page that
// forgot to mount <ConfirmDialog/> hung its button forever with no error. Here
// <ConfirmHost/> is mounted ONCE in the root layout (check-rules enforces it),
// and askConfirm resolves false at once if no host is mounted, so a missing host
// fails closed (the action doesn't happen) instead of hanging.
//
// Danger styling is the default, like web: every caller is about to do something
// that can't be undone. CANCEL is the first, left-hand button.
import React, { useEffect, useState } from "react";
import { View } from "react-native";
import { BottomSheet } from "./BottomSheet";
import { Button, ButtonRow } from "./Button";
import { Txt } from "./Text";
import { Ic } from "./Ic";
import { rgba, useTheme } from "./theme";

export type ConfirmOptions = { title: string; message: string; confirmLabel?: string; cancelLabel?: string; danger?: boolean };
type Pending = ConfirmOptions & { resolve: (ok: boolean) => void };

let show: ((p: Pending) => void) | null = null;

export function askConfirm(o: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    if (!show) {
      if (__DEV__) console.error("askConfirm: <ConfirmHost/> is not mounted. Resolving false.");
      resolve(false);
      return;
    }
    show({ ...o, resolve });
  });
}

export function ConfirmHost() {
  const { t } = useTheme();
  const [p, setP] = useState<Pending | null>(null);
  useEffect(() => {
    show = (next) => setP((cur) => { cur?.resolve(false); return next; }); // a second ask cancels the first
    return () => { show = null; };
  }, []);
  const close = (ok: boolean) => { p?.resolve(ok); setP(null); };
  const danger = p?.danger !== false;

  return (
    <BottomSheet open={!!p} onClose={() => close(false)} label={p?.title}>
      {p && (
        <>
          <View style={{ flexDirection: "row", alignItems: "center", gap: t.s3, marginBottom: t.s4 }}>
            <View style={{ width: 40, height: 40, borderRadius: 99, alignItems: "center", justifyContent: "center",
              backgroundColor: danger ? rgba(t.dangerRgb, 0.15) : t.accentSoft, borderWidth: t.hairW,
              borderColor: danger ? rgba(t.dangerRgb, 0.4) : t.accentLine }}>
              <Ic name="alert-triangle" size={18} color={danger ? t.danger : t.accent500} />
            </View>
            <Txt variant="bodyBold" size={1.05} style={{ flex: 1 }} accessibilityRole="header">{p.title}</Txt>
          </View>
          <Txt color={rgba(t.muted, 0.95)} style={{ lineHeight: 22 }}>{p.message}</Txt>
          <ButtonRow>
            <Button full onPress={() => close(false)} testID="confirm-cancel">{p.cancelLabel ?? "Cancel"}</Button>
            <Button full variant={danger ? "danger" : "primary"} onPress={() => close(true)} testID="confirm-ok">{p.confirmLabel ?? "Confirm"}</Button>
          </ButtonRow>
        </>
      )}
    </BottomSheet>
  );
}
