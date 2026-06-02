import {
  type DehydratedState,
  dehydrate,
  HydrationBoundary,
  type QueryClient,
} from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Home } from "@/components/screens/home";
import type { SessionChartSettings } from "@/lib/constants/visuals";
import queryKeys from "@/lib/query-keys";
import { activityActions } from "@/server-fcts/activities";
import { cookieActions } from "@/server-fcts/cookies";
import { weightActions } from "@/server-fcts/weights";
import type { CalendarScope } from "@/types/requests/activities";

export const Route = createFileRoute("/_authed/")({
  loader: async ({
    context,
  }): Promise<{
    dehydrated: DehydratedState;
    calendarScope: CalendarScope;
    sessionChartSettings: SessionChartSettings;
  }> => {
    const { queryClient } = context;
    const data = await loadHomePageDataFn(queryClient);
    return {
      dehydrated: dehydrate(queryClient),
      ...data,
    };
  },
  component: HomeRoute,
});

function HomeRoute() {
  const { dehydrated, calendarScope, sessionChartSettings } =
    Route.useLoaderData();
  return (
    <HydrationBoundary state={dehydrated}>
      <Home
        initialCalendarScope={calendarScope}
        initialChartSettings={sessionChartSettings}
      />
    </HydrationBoundary>
  );
}

const loadHomePageDataFn = async (
  queryClient: QueryClient,
): Promise<{
  calendarScope: CalendarScope;
  sessionChartSettings: SessionChartSettings;
}> => {
  const calendarScope = await cookieActions.getCalendarScope();
  const sessionChartSettings = await cookieActions.getVizSettings();

  // can't prefetch the .calendar() fct because it's timezone-dependent.
  queryClient.prefetchQuery({
    queryKey: queryKeys.activityViz(
      sessionChartSettings.kind,
      sessionChartSettings.range,
      sessionChartSettings.agg,
      sessionChartSettings.metric,
      sessionChartSettings.cumulative,
    ),
    queryFn: () => activityActions.viz({ data: { ...sessionChartSettings } }),
  });

  queryClient.prefetchQuery({
    queryKey: queryKeys.stackedActivityViz(
      sessionChartSettings.range,
      sessionChartSettings.metric,
      sessionChartSettings.agg,
      sessionChartSettings.proportional,
    ),
    queryFn: () =>
      activityActions.vizStacked({ data: { ...sessionChartSettings } }),
  });

  queryClient.prefetchQuery({
    queryKey: queryKeys.weightViz(sessionChartSettings.range),
    queryFn: () =>
      weightActions.viz({ data: { range: sessionChartSettings.range } }),
  });

  queryClient.prefetchQuery({
    queryKey: queryKeys.unlinkedActivities,
    queryFn: () => activityActions.unlinked(),
  });

  return {
    calendarScope,
    sessionChartSettings,
  };
};
