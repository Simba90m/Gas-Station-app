import { Pressable, View } from "react-native";
import { ThemedText } from "@/components/themed-text";
import { useTheme } from "@/hooks/use-theme";
import { Spacing } from "@/constants/theme";

export interface StarRatingProps {
  value: number;
  onChange?: (value: number) => void;
  size?: number;
  accessibilityLabel?: string;
}

/** A 1-5 star picker (tappable when onChange is given) or a plain read-only display otherwise. Uses the app's own theme colors — no new palette. */
export function StarRating({ value, onChange, size = 28, accessibilityLabel }: StarRatingProps) {
  const theme = useTheme();

  return (
    <View
      style={{ flexDirection: "row", gap: Spacing.one }}
      accessibilityRole={onChange ? "adjustable" : "text"}
      accessibilityLabel={accessibilityLabel ?? `${value} out of 5 stars`}
    >
      {[1, 2, 3, 4, 5].map((star) => {
        const filled = star <= value;
        const color = filled ? theme.primary : theme.border;
        const star_ = (
          <ThemedText style={{ fontSize: size, color, lineHeight: size + 4 }} accessibilityElementsHidden>
            {"★"}
          </ThemedText>
        );

        if (!onChange) return <View key={star}>{star_}</View>;

        return (
          <Pressable key={star} onPress={() => onChange(star)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`${star} star${star === 1 ? "" : "s"}`}>
            {star_}
          </Pressable>
        );
      })}
    </View>
  );
}
