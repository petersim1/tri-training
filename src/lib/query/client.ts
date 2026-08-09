import {
  defaultShouldDehydrateQuery,
  environmentManager,
  QueryClient,
} from "@tanstack/react-query";

export const makeQueryClient = (): QueryClient => {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000,
        refetchOnWindowFocus: false,
      },
      dehydrate: {
        // include pending queries in dehydration
        shouldDehydrateQuery: (query) =>
          defaultShouldDehydrateQuery(query) || query.state.status === "pending",
        shouldRedactErrors: (): boolean => false,
      },
    },
  });
};

let browserQueryClient: QueryClient | undefined = undefined;

export const getQueryClient = (): QueryClient => {
  if (environmentManager.isServer()) {
    return makeQueryClient();
  }
  if (!browserQueryClient) browserQueryClient = makeQueryClient();
  return browserQueryClient;
};
