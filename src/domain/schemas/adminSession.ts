import { z } from "zod";

export const AdminSessionStatusSchema = z.enum([
  "ACTIVE",
  "LOGGED_OUT_MANUAL",
  "LOGGED_OUT_AUTO",
]);

export const AdminSessionSchema = z.object({
  loggedInAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  status: AdminSessionStatusSchema,
  autoLogoutNotifiedAt: z.string().datetime().nullable(),
});

export type AdminSession = z.infer<typeof AdminSessionSchema>;
export type AdminSessionStatus = z.infer<typeof AdminSessionStatusSchema>;
