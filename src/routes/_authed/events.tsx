import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { EventsContent } from "@/components/screens/events";
import { getters } from "@/lib/query-keys";

export const Route = createFileRoute("/_authed/events")({
  loader: ({ context }) => {
    const { queryClient } = context;
    void queryClient.prefetchQuery(getters.events.list());
    return {
      dehydrated: dehydrate(queryClient),
    };
  },
  component: EventsPage,
});

function EventsPage() {
  const { dehydrated } = Route.useLoaderData();
  return (
    <HydrationBoundary state={dehydrated}>
      <EventsContent />
    </HydrationBoundary>
  );
}
