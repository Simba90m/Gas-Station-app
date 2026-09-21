import { router } from "expo-router";
import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import { ThemedText } from "@/components/themed-text";
import { PrimaryButton } from "@/components/ui/primary-button";
import { Screen } from "@/components/ui/screen";
import { ScreenHeader } from "@/components/ui/screen-header";
import { useJourney } from "@/lib/journey-context";
import { useLocale } from "@/lib/locale-context";
import { Spacing } from "@/constants/theme";

/** Step 3: the one fork in the journey — walk in now, or book a specific future time. */
export default function NeedScreen() {
  const { t } = useLocale();
  const { station, service, setMode } = useJourney();

  useEffect(() => {
    if (!station || !service) router.replace("/stations");
  }, [station, service]);

  if (!station || !service) return null;

  function handleStartNow() {
    setMode("queue");
    router.push("/queue");
  }

  function handleBookLater() {
    setMode("book");
    router.push("/book");
  }

  return (
    <Screen>
      <ScreenHeader title={t("need.title")} step={{ current: 2, total: 5 }} />
      <View style={styles.options}>
        {service.queueIsOpen ? (
          <View style={styles.optionGroup}>
            <PrimaryButton label={t("need.startNow")} onPress={handleStartNow} />
            <ThemedText type="small" themeColor="textSecondary">
              {t("need.startNowHint")}
            </ThemedText>
          </View>
        ) : (
          <ThemedText type="small" themeColor="textSecondary">
            {t("need.queueClosed")}
          </ThemedText>
        )}
        <View style={styles.optionGroup}>
          <PrimaryButton label={t("need.bookLater")} variant="secondary" onPress={handleBookLater} />
          <ThemedText type="small" themeColor="textSecondary">
            {t("need.bookLaterHint")}
          </ThemedText>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  options: { flex: 1, justifyContent: "center", gap: Spacing.five },
  optionGroup: { gap: Spacing.two, alignItems: "center" },
});
