import {
  type DehydratedState,
  dehydrate,
  HydrationBoundary,
  type QueryClient,
} from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Home } from "@/components/screens/home";
import type { SessionChartSettings } from "@/lib/constants/visuals";
import { getters } from "@/lib/query-keys";
import { toIsoDate } from "@/lib/utils/dates";
import { cookieActions } from "@/server-fcts/cookies";
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
  const { dehydrated, calendarScope, sessionChartSettings } = Route.useLoaderData();
  return (
    <HydrationBoundary state={dehydrated}>
      <Home initialCalendarScope={calendarScope} initialChartSettings={sessionChartSettings} />
    </HydrationBoundary>
  );
}

const loadHomePageDataFn = async (
  queryClient: QueryClient,
): Promise<{
  calendarScope: CalendarScope;
  sessionChartSettings: SessionChartSettings;
}> => {
  const timezone = await cookieActions.getTimezone();
  const calendarScope = await cookieActions.getCalendarScope();
  const sessionChartSettings = await cookieActions.getVizSettings();

  const anchor = toIsoDate(new Date(), timezone);

  queryClient.prefetchQuery(
    getters.calendar.list({
      period: calendarScope,
      anchor,
    }),
  );

  queryClient.prefetchQuery(getters.visuals.activity(sessionChartSettings));
  queryClient.prefetchQuery(getters.visuals.stack(sessionChartSettings));
  queryClient.prefetchQuery(getters.visuals.weights(sessionChartSettings.range));
  queryClient.prefetchQuery(getters.activities.unlinked());

  return {
    calendarScope,
    sessionChartSettings,
  };
};
