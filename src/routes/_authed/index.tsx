import {
  type DehydratedState,
  dehydrate,
  HydrationBoundary,
} from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Home } from "~/components/home/HomePage";
import type { CalendarScope } from "~/lib/home/calendar-scope";
import type { SessionChartSettings } from "~/lib/home/session-chart-settings";
import { loadHomePageDataFn } from "~/lib/server-fns/home";

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
  const data = Route.useLoaderData();
  return (
    <HydrationBoundary state={data.dehydrated}>
      <Home />
    </HydrationBoundary>
  );
}
