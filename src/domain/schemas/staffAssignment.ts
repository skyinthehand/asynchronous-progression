import { z } from "zod";

export const StaffAssignmentEntrySchema = z.object({
  id: z.number().int().optional(),
  poolId: z.string().min(1),
  staffName: z.string().min(1),
  recordedAt: z.string().datetime(),
});

export type StaffAssignmentEntry = z.infer<typeof StaffAssignmentEntrySchema>;
