import { StyleSheet, View } from "react-native";
import { useTheme } from "@/hooks/use-theme";
import { useLocale } from "@/lib/locale-context";
import { Spacing } from "@/constants/theme";

/**
 * A simple filled-segment progress bar — "the user should always know
 * what step they are currently on" without a busy stepper/breadcrumb UI.
 * `current` is 0-indexed; segments up to and including it are filled.
 */
export function ProgressSteps({ current, total }: { current: number; total: number }) {
  const theme = useTheme();
  const { isRTL } = useLocale();

  return (
    <View style={[styles.row, isRTL && styles.rowReverse]}>
      {Array.from({ length: total }).map((_, index) => (
        <View
          key={index}
          style={[
            styles.segment,
            { backgroundColor: index <= current ? theme.primary : theme.backgroundElement },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: Spacing.one },
  rowReverse: { flexDirection: "row-reverse" },
  segment: { flex: 1, height: 4, borderRadius: 2 },
});
