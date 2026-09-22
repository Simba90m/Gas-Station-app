import { StyleSheet, View } from "react-native";
import { CURRENCY } from "@gas-station/utils";
import { ThemedText } from "@/components/themed-text";
import { FeedbackSection } from "@/components/feedback-section";
import { PrimaryButton } from "@/components/ui/primary-button";
import { useLocale } from "@/lib/locale-context";
import { Spacing } from "@/constants/theme";

export interface BookingCompletedViewProps {
  bookingId: string;
  stationName: string;
  serviceName: string;
  /** The booking's own historical price (see hooks/use-booking.ts) — never a live/recomputed catalog price. */
  price: number;
  onDone: () => void;
}

/**
 * Shown in place of the normal status view, on both the "Start Now" (queue)
 * and "Book for Later" (booking) journeys, once their underlying booking
 * reaches COMPLETED — a distinct end state rather than just another row in
 * the status list. No payment/notification here yet, by design; feedback
 * (rate + comment, plus any management reply) is the one thing this screen
 * does collect, via FeedbackSection below.
 */
export function BookingCompletedView({ bookingId, stationName, serviceName, price, onDone }: BookingCompletedViewProps) {
  const { t, isRTL } = useLocale();
  const textAlign = isRTL ? "right" : "left";

  return (
    <View style={styles.container}>
      <ThemedText type="subtitle" style={{ textAlign }}>
        {t("confirmation.completedTitle")}
      </ThemedText>
      <ThemedText themeColor="textSecondary" style={{ textAlign }}>
        {t("confirmation.completedMessage")}
      </ThemedText>

      <View style={styles.card}>
        <Row label={t("confirmation.station")} value={stationName} />
        <Row label={t("confirmation.service")} value={serviceName} />
        <Row label={t("confirmation.price")} value={`${price} ${CURRENCY}`} />
      </View>

      <FeedbackSection bookingId={bookingId} />

      <PrimaryButton label={t("confirmation.backToHome")} onPress={onDone} />
    </View>
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
  container: { gap: Spacing.three },
  card: { gap: Spacing.one, paddingVertical: Spacing.two },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: Spacing.one },
  rowReverse: { flexDirection: "row-reverse" },
});
