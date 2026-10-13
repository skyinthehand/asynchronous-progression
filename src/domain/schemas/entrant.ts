import { z } from "zod";

export const AttendanceSchema = z.enum(["UNKNOWN", "PRESENT", "ABSENT"]);

export const AwayPeriodSchema = z.object({
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime().nullable(),
  reason: z.string().nullable(),
});

export const NextMatchInfoSchema = z.object({
  opponentName: z.string().nullable(),
  tableNumber: z.string().nullable(),
  confirmed: z.boolean(),
});

export const EntrantSchema = z.object({
  id: z.string().min(1),
  poolId: z.string().min(1),
  name: z.string().min(1),
  attendance: AttendanceSchema,
  attendanceRecordedAt: z.string().datetime().nullable(),
  poolFinished: z.boolean(),
  nextMatch: NextMatchInfoSchema.nullable(),
  awayPeriods: z.array(AwayPeriodSchema),
  /**
   * デザイン刷新(2026-10-09): start.gg側のこのプール内でのシード値
   * (phaseGroup.seeds)。表示専用の読み取り専用値で、本ツール内から
   * 変更する手段は提供しない。start.gg側に無い/未取得の場合はnull。
   */
  seed: z.number().int().nullable().default(null),
});

export type Entrant = z.infer<typeof EntrantSchema>;
export type Attendance = z.infer<typeof AttendanceSchema>;
export type NextMatchInfo = z.infer<typeof NextMatchInfoSchema>;
export type AwayPeriod = z.infer<typeof AwayPeriodSchema>;
