import type { PlanKind } from "../constants/activities";
import type {
  TypedVendorWorkoutRow,
  VendorActivityRow,
} from "../db/schema.server";

export const vendorActivityToPlanKind = (
  activity: VendorActivityRow,
): PlanKind | null => {
  const typedActivity = activity as TypedVendorWorkoutRow;

  if (typedActivity.vendor === "hevy") {
    return "lift";
  }
  if (typedActivity.vendor === "strava") {
    switch (typedActivity.data.sport_type) {
      case "Run":
      case "TrailRun":
      case "VirtualRun":
        return "run";
      case "Ride":
      case "EBikeRide":
      case "GravelRide":
      case "VirtualRide":
      case "MountainBikeRide":
      case "EMountainBikeRide":
        return "bike";
      case "Swim":
        return "swim";
      case "Yoga":
        return "recovery";
      default:
        return null;
    }
  }
  return null;
};

export const rawActivityType = (activity: VendorActivityRow) => {
  const typedActivity = activity as TypedVendorWorkoutRow;
  if (typedActivity.vendor === "hevy") {
    return "Lift";
  }
  return typedActivity.data.sport_type;
};
