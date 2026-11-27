// Port of web components/JobPhotos.tsx, CLIENT (read-only) role: the before and
// after photos the pro takes, from the private completion-photos bucket. A signing
// failure says "saved, couldn't load" with a retry, never a blank box that looks
// like nothing was uploaded. With neither photo uploaded the client sees nothing
// (web: two empty boxes look broken).
import React, { useEffect, useState } from "react";
import { Image, Pressable, View } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { Ic, Txt, rgba, ui, useTheme } from "@/kit";
import { supabase } from "@/lib/supabase";

type Kind = "before" | "after";

export function JobPhotos({ job }: { job: any }) {
  const { t } = useTheme();
  const paths: Record<Kind, string | null> = { before: job?.before_photo_path ?? null, after: job?.completion_photo_path ?? null };
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [failed, setFailed] = useState<Record<string, true>>({});
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    const want = [paths.before, paths.after].filter((p): p is string => !!p && !urls[p]);
    if (!want.length) return;
    void (async () => {
      for (const p of want) {
        try {
          const { data, error } = await supabase.storage.from("completion-photos").createSignedUrl(p, 3600);
          if (!alive) return;
          if (error || !data?.signedUrl) setFailed((f) => ({ ...f, [p]: true }));
          else setUrls((u) => ({ ...u, [p]: data.signedUrl }));
        } catch { if (alive) setFailed((f) => ({ ...f, [p]: true })); }
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paths.before, paths.after, tick]);

  if (!paths.before && !paths.after) return null;

  const slot = (kind: Kind, label: string) => {
    const p = paths[kind];
    const url = p ? urls[p] : null;
    const box = { height: ui.photoPreview, borderRadius: t.r2, borderWidth: t.hairW, borderColor: rgba(t.fg, 0.12), alignItems: "center" as const, justifyContent: "center" as const, padding: t.s2 };
    return (
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: t.s1, marginBottom: t.s2 }}>
          <Txt variant="label" size={0.75} color={p ? t.success : rgba(t.muted, 0.7)}>{label.toUpperCase()}</Txt>
          {p ? <Ic name="check-circle" size={ui.icon.sm} color={t.success} /> : null}
        </View>
        {url ? (
          <Pressable onPress={() => { WebBrowser.openBrowserAsync(url).catch(() => {}); /* the inline photo is still shown */ }} accessibilityRole="imagebutton" accessibilityLabel={"Open the " + label.toLowerCase() + " photo"}>
            <Image source={{ uri: url }} resizeMode="cover" accessibilityIgnoresInvertColors style={{ width: "100%", height: ui.photoPreview, borderRadius: t.r2 }} />
          </Pressable>
        ) : p && failed[p] ? (
          <View style={[box, { borderStyle: "dashed", gap: t.s1 }]}>
            <Txt size={0.76} color={rgba(t.muted, 0.65)} style={{ textAlign: "center" }}>The photo is saved, but we couldn’t load it just now.</Txt>
            <Pressable onPress={() => { setFailed((f) => { const n = { ...f }; delete n[p]; return n; }); setTick((x) => x + 1); }}
              accessibilityRole="button" hitSlop={t.s3} style={{ minHeight: t.hCtl, justifyContent: "center" }}>
              <Txt variant="bodyBold" size={0.78} color={t.text} style={{ textDecorationLine: "underline" }}>Try again</Txt>
            </Pressable>
          </View>
        ) : p ? (
          <View style={[box, { backgroundColor: rgba(t.fg, 0.05) }]} />
        ) : (
          <View style={[box, { borderStyle: "dashed" }]}><Txt size={0.78} color={rgba(t.muted, 0.55)}>Not uploaded yet</Txt></View>
        )}
      </View>
    );
  };

  return (
    <View style={{ marginTop: t.s4, padding: t.s4, borderRadius: t.r3, backgroundColor: rgba(t.fg, 0.03), borderWidth: t.hairW, borderColor: rgba(t.fg, 0.08) }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: t.s2, marginBottom: t.s1 }}>
        <Ic name="camera" size={ui.icon.md} color={rgba(t.muted, 0.8)} />
        <Txt variant="bodyBold" size={0.86}>Before & after photos</Txt>
      </View>
      <Txt size={0.78} lh={1.45} color={rgba(t.muted, 0.65)} style={{ marginBottom: t.s3 }}>
        Your contractor photographs the work area before starting and the finished job at the end, so you can see exactly what changed.
      </Txt>
      <View style={{ flexDirection: "row", gap: t.s3 }}>
        {slot("before", "Before")}
        {slot("after", "After")}
      </View>
    </View>
  );
}
