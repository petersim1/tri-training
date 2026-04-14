/// <reference types="vite/client" />
import { QueryClientProvider } from "@tanstack/react-query";
import {
  createRootRoute,
  HeadContent,
  Outlet,
  Scripts,
} from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { createServerFn } from "@tanstack/react-start";
import type * as React from "react";
import { DefaultCatchBoundary } from "~/components/DefaultCatchBoundary";
import { NotFound } from "~/components/NotFound";
import { getSessionOk } from "~/lib/auth/session-server";
import { getQueryClient } from "~/lib/query/client";
import appCss from "~/styles/app.css?url";

const fetchAuth = createServerFn({ method: "GET" }).handler(async () => {
  return { ok: await getSessionOk() };
});

export const Route = createRootRoute({
  beforeLoad: async () => {
    const auth = await fetchAuth();
    return { auth };
  },
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Workout tracker" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  errorComponent: (props) => (
    <RootDocument>
      <main className="flex min-h-0 flex-1 flex-col">
        <DefaultCatchBoundary {...props} />
      </main>
    </RootDocument>
  ),
  notFoundComponent: () => (
    <RootDocument>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        <NotFound />
      </main>
    </RootDocument>
  ),
  component: RootComponent,
});

function RootComponent() {
  return (
    <RootDocument>
      <Outlet />
    </RootDocument>
  );
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body className="flex min-h-dvh flex-col bg-zinc-950">
        <QueryClientProvider client={getQueryClient()}>
          {children}
        </QueryClientProvider>
        <TanStackRouterDevtools position="bottom-right" />
        <Scripts />
      </body>
    </html>
  );
}
