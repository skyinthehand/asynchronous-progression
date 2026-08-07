import { z } from "zod";

export const NoticeSchema = z.object({
  tournamentSlug: z.string().min(1),
  body: z.string(),
  hasEmergencyContact: z.boolean(),
  lastSyncedAt: z.string().datetime().nullable(),
});

export type Notice = z.infer<typeof NoticeSchema>;
