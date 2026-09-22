import { useState } from "react";
import { ActivityIndicator, StyleSheet, TextInput, View } from "react-native";
import { ThemedText } from "@/components/themed-text";
import { PrimaryButton } from "@/components/ui/primary-button";
import { StarRating } from "@/components/ui/star-rating";
import { useTheme } from "@/hooks/use-theme";
import { useFeedback, useFeedbackReplies, useSubmitFeedback } from "@/hooks/use-feedback";
import { useLocale } from "@/lib/locale-context";
import { Spacing } from "@/constants/theme";

/**
 * A lightweight feedback conversation for one completed booking — rate +
 * comment once, then (if already submitted) the same submission read-only
 * plus any "Station Management" replies underneath. Not a chat: no
 * composer for the customer to reply back, no realtime, no notifications.
 */
export function FeedbackSection({ bookingId }: { bookingId: string }) {
  const { t, isRTL } = useLocale();
  const theme = useTheme();
  const feedback = useFeedback(bookingId);
  const replies = useFeedbackReplies(feedback.data?.id);
  const submit = useSubmitFeedback();

  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");

  const textAlign = isRTL ? "right" : "left";

  function handleSubmit() {
    if (rating === 0) return;
    submit.mutate({ bookingId, rating, comment: comment.trim() || null });
  }

  if (feedback.isLoading) {
    return (
      <View style={styles.section}>
        <ActivityIndicator />
      </View>
    );
  }

  if (feedback.isError) {
    return (
      <View style={styles.section}>
        <ThemedText themeColor="danger" style={{ textAlign }}>
          {t("feedback.errorLoading")}
        </ThemedText>
      </View>
    );
  }

  // Already submitted — show it (read-only) plus any management replies.
  if (feedback.data) {
    return (
      <View style={styles.section}>
        <ThemedText type="smallBold" style={{ textAlign }}>
          {t("feedback.yourFeedback")}
        </ThemedText>
        <StarRating value={feedback.data.rating} accessibilityLabel={`${feedback.data.rating} out of 5 stars`} />
        {feedback.data.comment && (
          <ThemedText themeColor="textSecondary" style={{ textAlign }}>
            {feedback.data.comment}
          </ThemedText>
        )}

        {replies.isLoading && <ActivityIndicator />}
        {replies.isError && (
          <ThemedText themeColor="danger" style={{ textAlign }}>
            {t("feedback.errorLoadingReplies")}
          </ThemedText>
        )}
        {replies.isSuccess && replies.data.length > 0 && (
          <View style={styles.repliesList}>
            <ThemedText type="smallBold" style={{ textAlign }}>
              {t("feedback.repliesTitle")}
            </ThemedText>
            {replies.data.map((reply) => (
              <View key={reply.id} style={[styles.replyBubble, { backgroundColor: theme.backgroundElement }]}>
                <ThemedText type="small" themeColor="textSecondary" style={{ textAlign }}>
                  {t("feedback.stationManagement")}
                </ThemedText>
                <ThemedText style={{ textAlign }}>{reply.message}</ThemedText>
              </View>
            ))}
          </View>
        )}
      </View>
    );
  }

  // Not submitted yet — the form.
  return (
    <View style={styles.section}>
      <ThemedText type="smallBold" style={{ textAlign }}>
        {t("feedback.prompt")}
      </ThemedText>
      <StarRating value={rating} onChange={setRating} />
      <TextInput
        value={comment}
        onChangeText={setComment}
        placeholder={t("feedback.commentPlaceholder")}
        placeholderTextColor={theme.textSecondary}
        multiline
        style={[styles.input, { borderColor: theme.border, color: theme.text, textAlign }]}
      />
      <PrimaryButton
        label={submit.isPending ? t("feedback.submitting") : t("feedback.submit")}
        loading={submit.isPending}
        disabled={rating === 0}
        onPress={handleSubmit}
      />
      {submit.isError && (
        <ThemedText themeColor="danger" style={{ textAlign }}>
          {t("feedback.errorSubmitting")}
        </ThemedText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: Spacing.two, marginTop: Spacing.four },
  repliesList: { gap: Spacing.two, marginTop: Spacing.two },
  replyBubble: { borderRadius: Spacing.two, padding: Spacing.three, gap: Spacing.half },
  input: {
    minHeight: 72,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Spacing.two,
    padding: Spacing.three,
    textAlignVertical: "top",
  },
});
