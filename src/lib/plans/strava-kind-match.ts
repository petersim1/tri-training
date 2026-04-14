/** Rough match between Strava `sport_type` and plan kind (run / bike / swim). */
export function stravaSportMatchesPlanKind(
  planKind: "run" | "bike" | "swim",
  sportType: string,
): boolean {
  const s = sportType.trim().toLowerCase();
  if (planKind === "run") {
    return (
      s.includes("run") ||
      s === "walk" ||
      s === "hike" ||
      s === "trailrun" ||
      s === "virtualrun"
    );
  }
  if (planKind === "bike") {
    return (
      s.includes("ride") ||
      s.includes("bike") ||
      s === "ebikeride" ||
      s === "gravelride" ||
      s === "handcycle" ||
      s === "velomobile"
    );
  }
  if (planKind === "swim") {
    return s === "swim";
  }
  return false;
}

/** Map Strava `sport_type` to a single plan kind, or null if unsupported. */
export function inferPlanKindFromStravaSport(
  sportType: string,
): "run" | "bike" | "swim" | null {
  if (stravaSportMatchesPlanKind("swim", sportType)) {
    return "swim";
  }
  if (stravaSportMatchesPlanKind("bike", sportType)) {
    return "bike";
  }
  if (stravaSportMatchesPlanKind("run", sportType)) {
    return "run";
  }
  return null;
}
