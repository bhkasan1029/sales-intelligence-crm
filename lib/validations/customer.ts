import { z } from "zod";

/** Segments the seed writes, and the only ones the New Record form offers. */
export const SEGMENTS = ["HNI", "retail", "SME", "corporate"] as const;

/** Stages a record can be created in — 'active' is earned, never picked. */
export const NEW_RECORD_STAGES = ["new", "in_progress"] as const;

export const LEAD_SOURCES = [
  "referral",
  "campaign",
  "walk_in",
  "website",
  "partner",
] as const;

export const customerSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Give the record a name of at least 2 characters")
    .max(160, "Keep the name under 160 characters"),
  segment: z.enum(SEGMENTS),
  stage: z.enum(NEW_RECORD_STAGES),
  // Comes off a number input, which hands back a string when left blank.
  potential_value: z.coerce
    .number("Enter the potential value in rupees")
    .min(0, "Potential value cannot be negative")
    .max(1e12, "That value looks wrong"),
  lead_source: z.enum(LEAD_SOURCES),
  mobile: z
    .string()
    .trim()
    .regex(/^[6-9]\d{9}$/, "Enter a 10-digit mobile number")
    .optional()
    .or(z.literal("")),
  email: z.string().trim().pipe(z.email("Invalid email address")).optional().or(z.literal("")),
});

export type CustomerInput = z.infer<typeof customerSchema>;
