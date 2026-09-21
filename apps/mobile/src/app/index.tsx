import { router } from "expo-router";
import { StyleSheet, View } from "react-native";
import { ThemedText } from "@/components/themed-text";
import { LanguageToggle } from "@/components/language-toggle";
import { PrimaryButton } from "@/components/ui/primary-button";
import { Screen } from "@/components/ui/screen";
import { useJourney } from "@/lib/journey-context";
import { useLocale } from "@/lib/locale-context";
import { Spacing } from "@/constants/theme";

/**
 * Home: a minimal welcome screen with a single primary decision (Get
 * Started) — never a dashboard of options. The guided journey itself
 * starts fresh from here every time (reset()), so returning Home always
 * means "start over," which matches "Done" on the confirmation screens.
 */
export default function HomeScreen() {
  const { t, isRTL } = useLocale();
  const { reset } = useJourney();

  function handleGetStarted() {
    reset();
    router.push("/stations");
  }

  return (
    <Screen>
      <View style={[styles.topRow, { alignItems: isRTL ? "flex-start" : "flex-end" }]}>
        <LanguageToggle />
      </View>
      <View style={styles.hero}>
        <ThemedText type="title" style={[styles.title, { textAlign: isRTL ? "right" : "left" }]}>
          {t("home.title")}
        </ThemedText>
        <ThemedText themeColor="textSecondary" style={[styles.subtitle, { textAlign: isRTL ? "right" : "left" }]}>
          {t("home.subtitle")}
        </ThemedText>
      </View>
      <PrimaryButton label={t("home.getStarted")} onPress={handleGetStarted} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  topRow: { alignItems: "flex-end" },
  hero: { flex: 1, justifyContent: "center", gap: Spacing.two },
  title: { width: "100%" },
  subtitle: { width: "100%" },
});
