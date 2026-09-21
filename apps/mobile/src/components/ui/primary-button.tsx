import { ActivityIndicator, Pressable, StyleSheet, type PressableProps } from "react-native";
import { ThemedText } from "@/components/themed-text";
import { useTheme } from "@/hooks/use-theme";
import { Spacing } from "@/constants/theme";

export interface PrimaryButtonProps extends Omit<PressableProps, "children" | "style"> {
  label: string;
  variant?: "primary" | "secondary";
  loading?: boolean;
}

/**
 * The one tappable button used across the guided journey — large touch
 * target (min 52pt height, well above the 44pt accessibility minimum) per
 * the "large touch targets" UX requirement. `secondary` is used for the
 * less-emphasized of two choices (e.g. "Book for Later" next to "Start
 * Now") — never a third visual style invented per screen.
 */
export function PrimaryButton({ label, variant = "primary", loading, disabled, ...rest }: PrimaryButtonProps) {
  const theme = useTheme();
  const isDisabled = disabled || loading;

  const backgroundColor = variant === "primary" ? theme.primary : theme.backgroundElement;
  const textColor = variant === "primary" ? theme.onPrimary : theme.text;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled }}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        { backgroundColor, opacity: isDisabled ? 0.5 : pressed ? 0.85 : 1 },
      ]}
      {...rest}
    >
      {loading ? <ActivityIndicator color={textColor} /> : <ThemedText type="smallBold" style={{ color: textColor }}>{label}</ThemedText>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 52,
    borderRadius: Spacing.two,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.four,
  },
});
