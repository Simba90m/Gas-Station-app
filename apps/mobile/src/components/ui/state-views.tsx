import { ActivityIndicator, StyleSheet, View } from "react-native";
import { ThemedText } from "@/components/themed-text";
import { PrimaryButton } from "@/components/ui/primary-button";
import { useLocale } from "@/lib/locale-context";
import { Spacing } from "@/constants/theme";

/** Loading/error/empty states every data-driven screen needs — one shared shape instead of ad hoc handling per screen. */
export function LoadingView() {
  const { t } = useLocale();
  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" />
      <ThemedText themeColor="textSecondary">{t("common.loading")}</ThemedText>
    </View>
  );
}

export function ErrorView({ message, onRetry }: { message?: string; onRetry: () => void }) {
  const { t } = useLocale();
  return (
    <View style={styles.center}>
      <ThemedText type="subtitle" style={styles.centerText}>
        {t("common.error")}
      </ThemedText>
      {message && (
        <ThemedText themeColor="textSecondary" style={styles.centerText}>
          {message}
        </ThemedText>
      )}
      <PrimaryButton label={t("common.retry")} onPress={onRetry} />
    </View>
  );
}

export function EmptyView({ message }: { message: string }) {
  return (
    <View style={styles.center}>
      <ThemedText themeColor="textSecondary" style={styles.centerText}>
        {message}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: Spacing.three, paddingVertical: Spacing.six },
  centerText: { textAlign: "center" },
});
