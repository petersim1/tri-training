import { createServerFn } from "@tanstack/react-start";
import { getDb } from "@/lib/db/index.server";
import {
  type NewVendorActivityRow,
  type NewWeightEntryRow,
  vendorActivities,
  weightEntries,
} from "@/lib/db/schema.server";
import {
  fetchAllBodyMeasurements,
  fetchAllHevyWorkouts,
} from "@/lib/hevy/fetch-all";
import { fetchAllStravaWorkouts } from "@/lib/strava/fetch-all";
import { convertWeight } from "@/lib/utils/calculations";
import type { BackfillReport } from "@/types/responses/activities";

export const backfillLinkedWorkouts = createServerFn({
  method: "POST",
}).handler(async (): Promise<BackfillReport> => {
  const db = await getDb();
  const rows = await db
    .select({
      vendor: vendorActivities.vendor,
      vendorId: vendorActivities.vendorId,
    })
    .from(vendorActivities)
    .all();

  const measurements = await db.select().from(weightEntries);

  const report: BackfillReport = {
    importedStrava: 0,
    importedHevy: 0,
    importedHevyWeights: 0,
  };

  const existingHevyIds = new Set(
    rows
      .filter((r) => r.vendor === "hevy" && r.vendorId)
      .map((r) => r.vendorId),
  );
  const existingStravaIds = new Set(
    rows
      .filter((r) => r.vendor === "strava" && r.vendorId)
      .map((r) => r.vendorId),
  );
  const existingHevyMeasureEntries = new Set(measurements.map((m) => m.dayKey));

  const [hevyWorkouts, hevyMeasurements, stravaWorkouts] = await Promise.all([
    fetchAllHevyWorkouts(),
    fetchAllBodyMeasurements(),
    fetchAllStravaWorkouts(),
  ]);

  const workoutsCreate: NewVendorActivityRow[] = [];
  const weightEntriesCreate: NewWeightEntryRow[] = [];

  for (const w of hevyWorkouts) {
    const id = w.id;
    if (!existingHevyIds.has(id)) {
      report.importedHevy += 1;
      workoutsCreate.push({
        id: crypto.randomUUID(),
        createdAt: new Date(w.created_at),
        updatedAt: new Date(w.created_at),
        vendor: "hevy",
        vendorId: id,
        data: w,
      });
      existingHevyIds.add(w.id);
    }
  }

  for (const m of hevyMeasurements) {
    if (!existingHevyMeasureEntries.has(m.date) && !!m.weight_kg) {
      report.importedHevyWeights += 1;
      weightEntriesCreate.push({
        id: crypto.randomUUID(),
        dayKey: m.date,
        weightLb: convertWeight(m.weight_kg, "kg", "lb"),
      });
      existingHevyMeasureEntries.add(m.date);
    }
  }

  for (const w of stravaWorkouts) {
    const id = w.id.toString();
    if (!existingStravaIds.has(id)) {
      report.importedStrava += 1;
      workoutsCreate.push({
        id: crypto.randomUUID(),
        createdAt: new Date(w.start_date),
        updatedAt: new Date(w.start_date),
        vendor: "strava",
        vendorId: id,
        data: w,
      });
      existingStravaIds.add(id);
    }
  }

  if (weightEntriesCreate.length) {
    await db.insert(weightEntries).values([...weightEntriesCreate]);
  }
  if (workoutsCreate.length) {
    await db.insert(vendorActivities).values([...workoutsCreate]);
  }

  return report;
});
