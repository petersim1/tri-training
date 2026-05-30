import type { GroupItem, StackedGroupItem } from "@/types/responses/activities";
import type { CardioDistanceUnit } from "../constants/activities";
import type { SessionChartAgg, SessionChartMetric } from "../constants/visuals";
import type { TypedVendorWorkoutRow } from "../db/schema.server";

export const getVizValue = (
  activity: TypedVendorWorkoutRow,
  metric: SessionChartMetric,
): number | null => {
  if (activity.vendor === "strava") {
    switch (metric) {
      case "time":
        return convertTime(activity.data.moving_time, "s", "m");
      case "distance":
        return convertDistance(activity.data.distance, "m", "mi");
      case "pace":
        return (
          convertDistance(activity.data.distance, "m", "mi") /
          convertTime(activity.data.moving_time, "s", "hr")
        );
      case "efficiency":
        if (activity.data.average_heartrate) {
          // meter / beat
          const t = convertTime(activity.data.moving_time, "s", "m");
          return activity.data.distance / (activity.data.average_heartrate * t);
        }
        return null;
      default:
        return null;
    }
  } else if (activity.vendor === "hevy") {
    switch (metric) {
      case "time":
        return convertTime(
          new Date(activity.data.end_time).getTime() -
            new Date(activity.data.start_time).getTime(),
          "ms",
          "m",
        );
      case "volume":
        return (
          activity.data.exercises.reduce(
            (total, exercise) =>
              total +
              exercise.sets.reduce(
                (setTotal, set) =>
                  set.reps && set.weight_kg
                    ? setTotal +
                      Number(set.reps) *
                        convertWeight(Number(set.weight_kg), "kg", "lb")
                    : setTotal,
                0,
              ),
            0,
          ) || null
        );
      default:
        return null;
    }
  }

  return null;
};

const getRollupDateKey = (agg: SessionChartAgg, date: string): string => {
  if (agg === "day") {
    return date;
  } else if (agg === "week") {
    const d = new Date(date);
    const day = d.getDay();
    const diff = (day === 0 ? -6 : 1) - day;
    d.setDate(d.getDate() + diff);
    return d.toISOString().split("T")[0];
  } else {
    // month.
    return date.slice(0, 7);
  }
};

export const rollupValue = (
  group: Map<string, GroupItem>,
  agg: SessionChartAgg,
  metric: SessionChartMetric,
  date: string,
  value: number,
): void => {
  const key = getRollupDateKey(agg, date);

  const curValue = group.get(key) ?? {
    n: 0,
    v: 0,
  };

  if (metric === "distance" || metric === "time" || metric === "volume") {
    group.set(key, {
      n: curValue.n + 1,
      v: curValue.v + value,
    });
  } else {
    group.set(key, {
      n: curValue.n + 1,
      v: (curValue.n * curValue.v + value) / (curValue.n + 1),
    });
  }
};

export const rollupStackedValue = (
  group: Map<string, StackedGroupItem>,
  agg: SessionChartAgg,
  kind: "swim" | "bike" | "run",
  date: string,
  value: number,
): void => {
  const key = getRollupDateKey(agg, date);

  const cur = group.get(key) ?? { n: 0, values: { swim: 0, bike: 0, run: 0 } };
  group.set(key, {
    n: cur.n + 1,
    values: {
      ...cur.values,
      [kind]: cur.values[kind] + value,
    },
  });
};

export const DEFAULT_VIZ_UNIT: Record<SessionChartMetric, string> = {
  distance: "miles",
  efficiency: "meter/beat",
  pace: "mph",
  time: "mins",
  volume: "lbs",
};

const TO_KG: Record<"kg" | "lb", number> = {
  kg: 1,
  lb: 0.453592,
};

export const convertWeight = (
  value: number,
  inputUnit: "kg" | "lb",
  outputUnit: "kg" | "lb",
): number => {
  if (inputUnit === outputUnit) return value;
  return (value * TO_KG[inputUnit]) / TO_KG[outputUnit];
};

const TO_METERS: Record<CardioDistanceUnit, number> = {
  m: 1,
  km: 1000,
  mi: 1609.344,
  yd: 0.9144,
};

export const convertDistance = (
  value: number,
  inputUnit: CardioDistanceUnit,
  outputUnit: CardioDistanceUnit,
): number => {
  if (inputUnit === outputUnit) return value;
  return (value * TO_METERS[inputUnit]) / TO_METERS[outputUnit];
};

const TO_MILLISECONDS: Record<"ms" | "s" | "m" | "hr", number> = {
  ms: 1,
  s: 1_000,
  m: 60_000,
  hr: 3_600_000,
};

export const convertTime = (
  value: number,
  inputUnit: "ms" | "s" | "m" | "hr",
  outputUnit: "ms" | "s" | "m" | "hr",
): number => {
  if (inputUnit === outputUnit) return value;
  return (value * TO_MILLISECONDS[inputUnit]) / TO_MILLISECONDS[outputUnit];
};
