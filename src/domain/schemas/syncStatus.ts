import { z } from "zod";

export const SyncStatusSchema = z.object({
  poolId: z.string().min(1),
  lastSuccessAt: z.string().datetime().nullable(),
  lastFailureAt: z.string().datetime().nullable(),
  lastFailureReason: z.string().nullable(),
  pendingChangeCount: z.number().int().nonnegative(),
  isStale: z.boolean(),
});

export type SyncStatus = z.infer<typeof SyncStatusSchema>;
