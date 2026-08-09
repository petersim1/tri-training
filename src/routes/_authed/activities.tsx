import { type DehydratedState, dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { ActivitiesContent } from "@/components/screens/activities";
import { getters } from "@/lib/query-keys";
import { type ActivityListSchemaValues, activityListSchema } from "@/types/requests/activities";

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
    void queryClient.prefetchQuery(getters.activities.list(deps));
    void queryClient.prefetchQuery(getters.activities.unlinked());
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
