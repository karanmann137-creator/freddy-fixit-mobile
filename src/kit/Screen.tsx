// Native counterparts of web DashShell / DashContent / DashCard.
// Screen owns the safe area, the page background, pull-to-refresh and the
// keyboard-avoiding view, so no screen re-derives them.
//
// Pull-to-refresh IS the native "refresh". Web rule "if a refresh fixes it, say
// so": a failed read shows a message that says pull down (or a Retry button),
// never a confident zero.
import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, RefreshControl, ScrollView, View, type ScrollViewInstance, type ViewStyle } from "react-native";
import { SafeAreaView, type Edge } from "react-native-safe-area-context";
import { useTheme } from "./theme";

export function Screen({
  children, onRefresh, scroll = true, edges = ["top", "left", "right"], contentStyle, scrollRef,
}: {
  children: React.ReactNode;
  /** The ScrollView, for a screen that scrolls to a control it was sent to (web: an anchor id). */
  scrollRef?: React.Ref<ScrollViewInstance>;
  /** Re-run the screen's reads. Shows the native pull-to-refresh spinner while it runs. */
  onRefresh?: () => Promise<unknown>;
  scroll?: boolean;
  edges?: Edge[];
  contentStyle?: ViewStyle;
}) {
  const { t } = useTheme();
  const [refreshing, setRefreshing] = useState(false);
  const pad: ViewStyle = { paddingHorizontal: t.s4, paddingBottom: t.s10, ...contentStyle };
  return (
    <SafeAreaView edges={edges} style={{ flex: 1, backgroundColor: t.bg }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        {scroll ? (
          <ScrollView
            ref={scrollRef}
            contentContainerStyle={pad}
            keyboardShouldPersistTaps="handled"
            refreshControl={onRefresh ? (
              <RefreshControl refreshing={refreshing} tintColor={t.text}
                onRefresh={async () => {
                  setRefreshing(true);
                  // The screen's own reads render their failure state; the spinner must just stop.
                  try { await onRefresh(); } catch { /* shown by the screen */ } finally { setRefreshing(false); }
                }} />
            ) : undefined}
          >
            {children}
          </ScrollView>
        ) : <View style={[{ flex: 1 }, pad]}>{children}</View>}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function DashCard({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  const { t } = useTheme();
  return (
    <View style={[{ backgroundColor: t.cardBg, borderWidth: t.hairW, borderColor: t.cardBorder, borderRadius: t.r4, padding: t.s4, marginTop: t.s4 }, style]}>
      {children}
    </View>
  );
}
