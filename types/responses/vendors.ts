import type {
  HevyRoutineFolderSummary,
  HevyRoutineSummary,
} from "@/lib/hevy/types";

export type StartStravaOAuthResult =
  | { ok: true; authorizeUrl: string }
  | { ok: false; misconfigured: true };

export type StravaSettingsStrava =
  | { kind: "connected"; athleteId: number | null }
  | { kind: "misconfigured" }
  | { kind: "connect" };

export type HevyBodyMeasurementRow = {
  date: string;
  weight_kg?: number | null;
};

export type HevyHomeBundle = {
  hevyRoutines: HevyRoutineSummary[];
  hevyRoutineGroups: {
    folder: HevyRoutineFolderSummary;
    routines: HevyRoutineSummary[];
  }[];
  hevyRoutinesUnfoldered: HevyRoutineSummary[];
};
