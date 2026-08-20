import { z } from "zod";

/** Mirrors the CHECK constraint on feedback.category in schema.sql. */
export const FEEDBACK_CATEGORIES = [
  "rule_dispute",
  "system_bug",
  "process",
  "other",
] as const;

export const FEEDBACK_CATEGORY_LABEL: Record<
  (typeof FEEDBACK_CATEGORIES)[number],
  string
> = {
  rule_dispute: "Rule dispute",
  system_bug: "System bug",
  process: "Process",
  other: "Other",
};

export const feedbackSchema = z.object({
  category: z.enum(FEEDBACK_CATEGORIES),
  // Bounds match the client-side minLength on the shared feedback form, so the
  // server never rejects something the form let through.
  subject: z
    .string()
    .trim()
    .min(3, "Give it a subject of at least 3 characters")
    .max(160, "Keep the subject under 160 characters"),
  body: z
    .string()
    .trim()
    .min(5, "Add a few words of detail")
    .max(4000, "Keep it under 4000 characters"),
  related_rule_id: z.uuid().optional().or(z.literal("")),
  related_action_id: z.uuid().optional().or(z.literal("")),
});

export type FeedbackInput = z.infer<typeof feedbackSchema>;
