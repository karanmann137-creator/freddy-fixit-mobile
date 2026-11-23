// The one bottom sheet (web .ffu-scrim/.ffu-modal/.ffu-grab). Rises from the
// bottom edge, buttons under the thumb; tapping the scrim or Android back closes it.
// React Native's Modal is enough here. No gesture library until a screen needs drag.
import React from "react";
import { Modal, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { rgba, ui, useTheme } from "./theme";

export function BottomSheet({ open, onClose, children, label }: { open: boolean; onClose: () => void; children: React.ReactNode; label?: string }) {
  const { t, reduceMotion } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={open} transparent animationType={reduceMotion ? "none" : "slide"} onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={{ flex: 1, backgroundColor: rgba(t.bgRgb, 0.6) }} onPress={onClose} accessibilityLabel="Close" accessibilityRole="button" />
      <View accessibilityViewIsModal accessibilityLabel={label}
        style={{ maxHeight: "90%", backgroundColor: t.surface2, borderTopLeftRadius: t.r4, borderTopRightRadius: t.r4, paddingHorizontal: t.s5,
          paddingTop: t.s3, paddingBottom: Math.max(insets.bottom, t.s4) + t.s2, borderWidth: t.hairW, borderColor: t.cardBorder }}>
        <View style={{ alignSelf: "center", width: ui.grabW, height: ui.grabH, borderRadius: ui.pill, backgroundColor: rgba(t.fg, 0.18), marginBottom: t.s4 }}
          accessibilityElementsHidden importantForAccessibility="no" />
        {/* Content taller than the screen scrolls, so the buttons at the bottom stay reachable. */}
        <ScrollView bounces={false} keyboardShouldPersistTaps="handled">{children}</ScrollView>
      </View>
    </Modal>
  );
}
