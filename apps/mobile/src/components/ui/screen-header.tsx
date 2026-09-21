import { router } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";
import { ThemedText } from "@/components/themed-text";
import { ProgressSteps } from "@/components/ui/progress-steps";
import { useLocale } from "@/lib/locale-context";
import { useTheme } from "@/hooks/use-theme";
import { Spacing } from "@/constants/theme";

export interface ScreenHeaderProps {
  title: string;
  /** 0-indexed step (see ProgressSteps) — omit on Home, where there's no journey in progress yet. */
  step?: { current: number; total: number };
  /** Defaults to router.back(); a screen with extra state to clear (e.g. "Change station") can override it. */
  onBack?: () => void;
}

/**
 * Shared header for every journey screen: back button on the correct
 * (reading-direction-aware) side, translated title, and a progress bar so
 * "the user always knows what step they are on" — see app/_layout.tsx for
 * why this is hand-built instead of the native Stack header.
 */
export function ScreenHeader({ title, step, onBack }: ScreenHeaderProps) {
  const theme = useTheme();
  const { isRTL, t } = useLocale();

  return (
    <View style={styles.container}>
      <View style={[styles.row, isRTL && styles.rowReverse]}>
        {(onBack || router.canGoBack()) && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("common.back")}
            onPress={onBack ?? (() => router.back())}
            hitSlop={12}
            style={styles.backButton}
          >
            <ThemedText type="default" style={{ color: theme.primary }}>
              {isRTL ? "›" : "‹"} {t("common.back")}
            </ThemedText>
          </Pressable>
        )}
      </View>
      <ThemedText type="subtitle" style={[styles.title, { textAlign: isRTL ? "right" : "left" }]}>
        {title}
      </ThemedText>
      {step && <ProgressSteps current={step.current} total={step.total} />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: Spacing.two },
  row: { flexDirection: "row", minHeight: 28 },
  rowReverse: { flexDirection: "row-reverse" },
  backButton: { paddingVertical: Spacing.one },
  title: { width: "100%" },
});
