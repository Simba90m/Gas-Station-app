import { ScrollView, StyleSheet, View, type ViewProps } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ThemedView } from "@/components/themed-view";
import { Spacing, MaxContentWidth } from "@/constants/theme";

/**
 * Consistent full-screen container for every step of the guided journey —
 * safe-area aware, capped content width (matches the default template's
 * own MaxContentWidth, for sane behavior on tablet/web), scrollable so a
 * long list (stations, services, available slots) never gets clipped.
 */
export function Screen({ children, style, scroll = true }: ViewProps & { scroll?: boolean }) {
  const Container = scroll ? ScrollView : View;
  return (
    <ThemedView style={styles.root}>
      <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
        <Container
          style={scroll ? styles.scroll : [styles.content, style]}
          contentContainerStyle={scroll ? [styles.content, style] : undefined}
        >
          {children}
        </Container>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safeArea: { flex: 1, alignItems: "center" },
  scroll: { flex: 1, width: "100%" },
  content: {
    width: "100%",
    maxWidth: MaxContentWidth,
    alignSelf: "center",
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    gap: Spacing.three,
  },
});
