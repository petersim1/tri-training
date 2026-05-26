import {
  type DehydratedState,
  dehydrate,
  HydrationBoundary,
} from "@tanstack/react-query";
import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { ActivitiesContent } from "@/components/screens/activities";
import queryKeys from "@/lib/query-keys";
import { activityActions } from "@/server-fcts";
import {
  type ActivityListSchemaValues,
  activityListSchema,
} from "@/types/requests/activities";

export const Route = createFileRoute("/_authed/activities")({
  validateSearch: activityListSchema,
  search: {
    middlewares: [stripSearchParams(activityListSchema.parse({}))],
  },
  loaderDeps: ({ search }) => search,
  loader: async ({
    context,
    deps,
  }): Promise<{
    dehydrated: DehydratedState;
    initialQuery: ActivityListSchemaValues;
  }> => {
    const { queryClient } = context;
    void queryClient.prefetchQuery({
      queryKey: queryKeys.activitiesList(deps),
      queryFn: () => activityActions.list({ data: deps }),
    });
    void queryClient.prefetchQuery({
      queryKey: queryKeys.unlinkedActivities,
      queryFn: () => activityActions.unlinked(),
    });
    return {
      dehydrated: dehydrate(queryClient),
      initialQuery: deps,
    };
  },
  component: ActivitiesPage,
});

function ActivitiesPage() {
  const data = Route.useLoaderData();
  return (
    <HydrationBoundary state={data.dehydrated}>
      <ActivitiesContent initialQuery={data.initialQuery} />
    </HydrationBoundary>
  );
}
