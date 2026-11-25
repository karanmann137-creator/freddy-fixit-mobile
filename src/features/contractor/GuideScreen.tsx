// Contractor guide (PLAN step 5.11): port of web ContractorGuide. An Archivo read
// screen. ALL text comes from the synced src/lib/contractorGuide.ts (the page, the
// emailed copy and the welcome email share it); this file only renders it.
// The markdown subset that module allows: "## " headings, "- " bullets, "1. " lists,
// blank-line paragraphs, **bold** and [text](url).
import React from "react";
import { View } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { Screen, ScreenHeader, Txt, notify, rgba, useTheme } from "@/kit";
import { CONTRACTOR_GUIDE_MD, CONTRACTOR_GUIDE_PREHEADER, CONTRACTOR_GUIDE_TITLE } from "@/lib/contractorGuide";

type Block =
  | { k: "h"; text: string }
  | { k: "p"; text: string }
  | { k: "ul"; items: string[] }
  | { k: "ol"; items: string[] };

function parse(md: string): Block[] {
  const out: Block[] = [];
  for (const chunk of md.split(/\n\s*\n/)) {
    const lines = chunk.split("\n").map((l) => l.trimEnd()).filter((l) => l.trim() !== "");
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (line.startsWith("## ")) { out.push({ k: "h", text: line.slice(3) }); i++; continue; }
      if (/^- /.test(line)) {
        const items: string[] = [];
        while (i < lines.length && /^- /.test(lines[i])) items.push(lines[i++].slice(2));
        out.push({ k: "ul", items }); continue;
      }
      if (/^\d+\. /.test(line)) {
        const items: string[] = [];
        while (i < lines.length && /^\d+\. /.test(lines[i])) items.push(lines[i++].replace(/^\d+\. /, ""));
        out.push({ k: "ol", items }); continue;
      }
      const para: string[] = [];
      while (i < lines.length && !lines[i].startsWith("## ") && !/^- /.test(lines[i]) && !/^\d+\. /.test(lines[i])) para.push(lines[i++]);
      out.push({ k: "p", text: para.join(" ") });
    }
  }
  return out;
}

const openLink = (url: string) => {
  WebBrowser.openBrowserAsync(url).catch(() => notify("Couldn't open the link. Check your connection and try again.", "danger"));
};

/** Inline **bold** and [text](url). Nested <Txt> inherits size from the parent. */
function Inline({ text }: { text: string }) {
  const { t } = useTheme();
  const parts = text.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g).filter(Boolean);
  return (
    <>
      {parts.map((p, i) => {
        const b = /^\*\*([^*]+)\*\*$/.exec(p);
        if (b) return <Txt key={i} variant="bodyBold">{b[1]}</Txt>;
        const l = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(p);
        if (l) return <Txt key={i} accessibilityRole="link" color={t.text} style={{ textDecorationLine: "underline" }} onPress={() => openLink(l[2])}>{l[1]}</Txt>;
        return <Txt key={i}>{p}</Txt>;
      })}
    </>
  );
}

export function GuideScreen() {
  const { t } = useTheme();
  const blocks = parse(CONTRACTOR_GUIDE_MD);
  return (
    <Screen>
      <ScreenHeader title="Guide" />
      <Txt variant="label" size={0.8} color={rgba(t.muted, 0.8)} style={{ marginTop: t.s4 }}>For contractors</Txt>
      <Txt variant="display" size={1.9} lh={1.2} accessibilityRole="header" style={{ marginTop: t.s2 }}>{CONTRACTOR_GUIDE_TITLE}</Txt>
      <Txt lh={1.6} color={rgba(t.muted, 0.8)} style={{ marginTop: t.s3, marginBottom: t.s4 }}>{CONTRACTOR_GUIDE_PREHEADER}</Txt>
      {blocks.map((b, i) => {
        if (b.k === "h") return <Txt key={i} variant="display" size={1.3} lh={1.25} accessibilityRole="header" style={{ marginTop: t.s8, marginBottom: t.s2 }}>{b.text}</Txt>;
        if (b.k === "p") return <Txt key={i} lh={1.7} color={rgba(t.muted, 0.9)} style={{ marginTop: t.s3 }}><Inline text={b.text} /></Txt>;
        return (
          <View key={i} style={{ marginTop: t.s3, gap: t.s2 }}>
            {b.items.map((it, j) => (
              <View key={j} style={{ flexDirection: "row", gap: t.s3 }}>
                <Txt lh={1.7} color={rgba(t.muted, 0.9)} style={{ minWidth: t.s5 }}>{b.k === "ol" ? `${j + 1}.` : "•"}</Txt>
                <Txt lh={1.7} color={rgba(t.muted, 0.9)} style={{ flex: 1 }}><Inline text={it} /></Txt>
              </View>
            ))}
          </View>
        );
      })}
      <View style={{ marginTop: t.s8, padding: t.s4, backgroundColor: t.cardBg, borderWidth: t.hairW, borderColor: t.cardBorder, borderRadius: t.r4 }}>
        <Txt lh={1.6} color={rgba(t.muted, 0.9)}>You can come back to this guide any time.</Txt>
      </View>
    </Screen>
  );
}
