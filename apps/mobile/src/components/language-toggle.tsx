import { Pressable, StyleSheet, View } from "react-native";
import { ThemedText } from "@/components/themed-text";
import { useTheme } from "@/hooks/use-theme";
import { useLocale } from "@/lib/locale-context";
import { LOCALES, type Locale } from "@gas-station/i18n";
import { Spacing } from "@/constants/theme";

const OPTIONS: Locale[] = ["en", "ar"];

/** Live EN/AR switch — see lib/locale-context.tsx for the reload-free direction-aware approach this relies on. */
export function LanguageToggle() {
  const theme = useTheme();
  const { locale, setLocale } = useLocale();

  return (
    <View style={[styles.row, { borderColor: theme.border, backgroundColor: theme.backgroundElement }]}>
      {OPTIONS.map((option) => {
        const selected = option === locale;
        return (
          <Pressable
            key={option}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => setLocale(option)}
            style={[styles.option, selected && { backgroundColor: theme.primary }]}
          >
            <ThemedText type="smallBold" style={{ color: selected ? theme.onPrimary : theme.text }}>
              {LOCALES[option].label}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    borderRadius: Spacing.two,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 2,
    alignSelf: "flex-start",
  },
  option: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    borderRadius: Spacing.one,
  },
});
