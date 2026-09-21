import { router } from "expo-router";
import { View } from "react-native";
import { OptionCard } from "@/components/ui/option-card";
import { Screen } from "@/components/ui/screen";
import { ScreenHeader } from "@/components/ui/screen-header";
import { EmptyView, ErrorView, LoadingView } from "@/components/ui/state-views";
import { useStations } from "@/hooks/use-stations";
import { useJourney, type StationSelection } from "@/lib/journey-context";
import { useLocale } from "@/lib/locale-context";
import { Spacing } from "@/constants/theme";

/** Step 1: choose a station. Loaded fresh from Supabase every time — never hardcoded. */
export default function StationsScreen() {
  const { t, locale } = useLocale();
  const { setStation } = useJourney();
  const { data: stations, isLoading, isError, refetch } = useStations();

  function handleSelect(station: StationSelection) {
    setStation(station);
    router.push("/services");
  }

  return (
    <Screen>
      <ScreenHeader title={t("stations.title")} step={{ current: 0, total: 5 }} />
      {isLoading && <LoadingView />}
      {isError && <ErrorView message={t("stations.errorLoading")} onRetry={() => refetch()} />}
      {!isLoading && !isError && stations && stations.length === 0 && <EmptyView message={t("stations.empty")} />}
      {!isLoading && !isError && stations && stations.length > 0 && (
        <View style={{ gap: Spacing.two }}>
          {stations.map((station) => (
            <OptionCard
              key={station.id}
              title={locale === "ar" ? station.nameAr : station.nameEn}
              subtitle={locale === "ar" ? station.addressAr : station.addressEn}
              onPress={() => handleSelect(station)}
            />
          ))}
        </View>
      )}
    </Screen>
  );
}
