import z from "zod";

export const timezoneSchema = z.object({
  timezone: z.string().refine(
    (tz) => {
      try {
        Intl.DateTimeFormat(undefined, { timeZone: tz });
        return true;
      } catch {
        return false;
      }
    },
    { message: "Invalid IANA timezone" },
  ),
});

export type TimeZoneSchemaValues = z.infer<typeof timezoneSchema>;

export const idSchema = z.object({
  id: z.string(),
});

export type IdSchemaValues = z.infer<typeof idSchema>;

export const dayKeySchema = z.object({
  dayKey: z.iso.date(),
});

export type DayKeySchemaValues = z.infer<typeof dayKeySchema>;
