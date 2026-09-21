import { router } from "expo-router";
import { useEffect } from "react";
import { View } from "react-native";
import { OptionCard } from "@/components/ui/option-card";
import { Screen } from "@/components/ui/screen";
import { ScreenHeader } from "@/components/ui/screen-header";
import { EmptyView, ErrorView, LoadingView } from "@/components/ui/state-views";
import { useStationServices } from "@/hooks/use-station-services";
import { useJourney, type ServiceSelection } from "@/lib/journey-context";
import { useLocale } from "@/lib/locale-context";
import { Spacing } from "@/constants/theme";

/**
 * Step 2: choose a service actually offered at the chosen station. Only
 * leaf (bookable) services appear — a parent/category service is filtered
 * out entirely by use-station-services.ts, never shown as selectable.
 */
export default function ServicesScreen() {
  const { t, locale } = useLocale();
  const { station, setService } = useJourney();
  const { data: services, isLoading, isError, refetch } = useStationServices(station?.id);

  useEffect(() => {
    if (!station) router.replace("/stations");
  }, [station]);

  function handleSelect(service: ServiceSelection) {
    setService(service);
    router.push("/need");
  }

  if (!station) return null;

  return (
    <Screen>
      <ScreenHeader title={t("services.title")} step={{ current: 1, total: 5 }} />
      {isLoading && <LoadingView />}
      {isError && <ErrorView message={t("services.errorLoading")} onRetry={() => refetch()} />}
      {!isLoading && !isError && services && services.length === 0 && <EmptyView message={t("services.empty")} />}
      {!isLoading && !isError && services && services.length > 0 && (
        <View style={{ gap: Spacing.two }}>
          {services.map((service) => (
            <OptionCard
              key={service.stationServiceId}
              title={locale === "ar" ? service.nameAr : service.nameEn}
              subtitle={`${service.durationMinutes} ${t("common.minutesShort")}`}
              badge={service.queueIsOpen ? t("need.startNowHint") : undefined}
              onPress={() => handleSelect(service)}
            />
          ))}
        </View>
      )}
    </Screen>
  );
}
