import { Pressable, StyleSheet, View } from "react-native";
import { ThemedText } from "@/components/themed-text";
import { useTheme } from "@/hooks/use-theme";
import { useLocale } from "@/lib/locale-context";
import { Spacing } from "@/constants/theme";

export interface OptionCardProps {
  title: string;
  subtitle?: string;
  badge?: string;
  onPress: () => void;
}

/**
 * One selectable row in a station/service list — large touch target,
 * direction-aware (title/subtitle align to the reading direction, badge
 * sits on the trailing edge whichever side that is for the current
 * locale).
 */
export function OptionCard({ title, subtitle, badge, onPress }: OptionCardProps) {
  const theme = useTheme();
  const { isRTL } = useLocale();

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: theme.backgroundElement, borderColor: theme.border, opacity: pressed ? 0.85 : 1 },
        isRTL && styles.rowReverse,
      ]}
    >
      <View style={styles.textColumn}>
        <ThemedText type="default" style={[styles.title, { textAlign: isRTL ? "right" : "left" }]}>
          {title}
        </ThemedText>
        {subtitle && (
          <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: isRTL ? "right" : "left" }}>
            {subtitle}
          </ThemedText>
        )}
      </View>
      {badge && (
        <ThemedText type="small" themeColor="success">
          {badge}
        </ThemedText>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.three,
    minHeight: 64,
    borderRadius: Spacing.two,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  rowReverse: { flexDirection: "row-reverse" },
  textColumn: { flex: 1, gap: 2 },
  title: { fontWeight: "600" },
});
