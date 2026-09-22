import { z } from "zod";

export const addFeedbackReplySchema = z.object({
  feedback_id: z.string().trim().guid("Missing feedback."),
  message: z
    .string()
    .trim()
    .min(1, "Write a reply before sending.")
    .max(1000, "Keep the reply under 1000 characters."),
});
