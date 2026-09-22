import { router, useLocalSearchParams } from "expo-router";
import { StyleSheet, View } from "react-native";
import { BookingCompletedView } from "@/components/booking-completed";
import { ThemedText } from "@/components/themed-text";
import { PrimaryButton } from "@/components/ui/primary-button";
import { Screen } from "@/components/ui/screen";
import { ScreenHeader } from "@/components/ui/screen-header";
import { ErrorView, LoadingView } from "@/components/ui/state-views";
import { useBooking } from "@/hooks/use-booking";
import { useJourney } from "@/lib/journey-context";
import { useLocale } from "@/lib/locale-context";
import type { BookingStatus } from "@gas-station/types";
import type { TranslationKey } from "@gas-station/i18n";
import { Spacing } from "@/constants/theme";

const STATUS_KEY: Record<BookingStatus, TranslationKey> = {
  PENDING: "queue.statusWaiting",
  CONFIRMED: "confirmation.statusConfirmed",
  CHECKED_IN: "queue.statusCalled",
  IN_PROGRESS: "queue.statusInService",
  COMPLETED: "queue.statusCompleted",
  CANCELLED: "queue.statusCancelled",
  NO_SHOW: "queue.statusNoShow",
};

/** Step 5 (Book for Later path): the booking's confirmation/status detail — date, time, station, service, status. */
export default function ConfirmationScreen() {
  const { t, locale, isRTL } = useLocale();
  const { reset } = useJourney();
  const { bookingId } = useLocalSearchParams<{ bookingId?: string }>();
  const booking = useBooking(bookingId);

  function handleDone() {
    reset();
    router.replace("/");
  }

  return (
    <Screen>
      <ScreenHeader title={t("confirmation.bookingTitle")} onBack={handleDone} />

      {booking.isLoading && <LoadingView />}
      {(booking.isError || !bookingId) && <ErrorView message={t("common.error")} onRetry={() => booking.refetch()} />}

      {booking.isSuccess && booking.data && booking.data.status === "COMPLETED" && (
        <BookingCompletedView
          bookingId={booking.data.id}
          stationName={locale === "ar" ? booking.data.stationNameAr : booking.data.stationNameEn}
          serviceName={locale === "ar" ? booking.data.serviceNameAr : booking.data.serviceNameEn}
          price={booking.data.price}
          onDone={handleDone}
        />
      )}

      {booking.isSuccess && booking.data && booking.data.status !== "COMPLETED" && (
        <>
          <ThemedText themeColor="textSecondary" style={{ textAlign: isRTL ? "right" : "left" }}>
            {t("confirmation.bookingSubtitle")}
          </ThemedText>

          <View style={styles.card}>
            <Row label={t("confirmation.station")} value={locale === "ar" ? booking.data.stationNameAr : booking.data.stationNameEn} />
            <Row label={t("confirmation.service")} value={locale === "ar" ? booking.data.serviceNameAr : booking.data.serviceNameEn} />
            <Row
              label={t("confirmation.date")}
              value={
                booking.data.start
                  ? new Date(booking.data.start).toLocaleDateString(locale === "ar" ? "ar" : "en-US", {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                    })
                  : "—"
              }
            />
            <Row
              label={t("confirmation.time")}
              value={
                booking.data.start
                  ? new Date(booking.data.start).toLocaleTimeString(locale === "ar" ? "ar" : "en-US", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "—"
              }
            />
            <Row label={t("confirmation.status")} value={t(STATUS_KEY[booking.data.status])} />
          </View>

          <PrimaryButton label={t("confirmation.done")} onPress={handleDone} />
        </>
      )}
    </Screen>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  const { isRTL } = useLocale();
  return (
    <View style={[styles.row, isRTL && styles.rowReverse]}>
      <ThemedText themeColor="textSecondary">{label}</ThemedText>
      <ThemedText type="smallBold">{value}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: Spacing.one, paddingVertical: Spacing.two },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: Spacing.one },
  rowReverse: { flexDirection: "row-reverse" },
});
