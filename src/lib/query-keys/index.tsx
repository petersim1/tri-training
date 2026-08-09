import { type QueryClient, queryOptions } from "@tanstack/react-query";
import { activityActions } from "@/server-fcts/activities";
import { chatActions } from "@/server-fcts/chat";
import { cookieActions } from "@/server-fcts/cookies";
import { dayActions } from "@/server-fcts/days";
import { eventActions } from "@/server-fcts/events";
import { vendorActions } from "@/server-fcts/vendors";
import { weightActions } from "@/server-fcts/weights";
import { ChatProposal } from "@/types/db";
import type {
  ActivityListSchemaValues,
  CalendarSchemaValues,
  VizSchemaValues,
} from "@/types/requests/activities";
import {
  CalendarPageItem,
  DayItem,
  PlannedWorkoutsPageResult,
  StackedVizResult,
  VizResult,
} from "@/types/responses/activities";
import { ChatMessageItem } from "@/types/responses/chats";
import type { SessionChartRange } from "../constants/visuals";
import type { ChatThreadRow, SportEventRow, WorkoutEntryWithCompleted } from "../db/schema.server";

const QUERY_KEYS = {
  ACTIVITIES: "activities",
  CALENDAR: "calendar",
  VISUAL: "visual",
  DAYS: "days",
  CHATS: "chats",
  MESSAGES: "messages",
  ROUTINES: "routines",
  TIMEZONE: "timezone",
  EVENTS: "events",
};

export const getters = {
  activities: {
    list: (query: ActivityListSchemaValues) =>
      queryOptions({
        queryKey: [QUERY_KEYS.ACTIVITIES, "list", query],
        queryFn: () => activityActions.list({ data: query }),
      }),
    unlinked: () =>
      queryOptions({
        queryKey: [QUERY_KEYS.ACTIVITIES, "unlinked"],
        queryFn: () => activityActions.unlinked(),
      }),
  },
  events: {
    list: () =>
      queryOptions({
        queryKey: [QUERY_KEYS.EVENTS, "list"],
        queryFn: () => eventActions.list(),
      }),
  },
  visuals: {
    weights: (range?: SessionChartRange) =>
      queryOptions({
        queryKey: [QUERY_KEYS.VISUAL, "weight", range],
        queryFn: () => weightActions.viz({ data: { range } }),
      }),
    activity: (settings: VizSchemaValues) =>
      queryOptions({
        queryKey: [QUERY_KEYS.VISUAL, "activity", settings],
        queryFn: () => activityActions.viz({ data: settings }),
      }),
    stack: (settings: VizSchemaValues) =>
      queryOptions({
        queryKey: [QUERY_KEYS.VISUAL, "stacked", settings],
        queryFn: () => activityActions.vizStacked({ data: settings }),
      }),
  },
  calendar: {
    timezone: () =>
      queryOptions({
        queryKey: [QUERY_KEYS.TIMEZONE],
        queryFn: () => cookieActions.getTimezone(),
      }),
    day: (dayKey: string) =>
      queryOptions({
        queryKey: [QUERY_KEYS.DAYS, dayKey],
        queryFn: () => dayActions.dayInfo({ data: { dayKey } }),
      }),
    list: (settings: CalendarSchemaValues) =>
      queryOptions({
        queryKey: [QUERY_KEYS.CALENDAR, settings],
        queryFn: () => activityActions.calendar({ data: settings }),
      }),
  },
  chats: {
    list: () =>
      queryOptions({
        queryKey: [QUERY_KEYS.CHATS, "list"],
        queryFn: () => chatActions.listThreads(),
      }),
    messages: (threadId: string) =>
      queryOptions({
        queryKey: [QUERY_KEYS.CHATS, "messages", threadId],
        queryFn: () => chatActions.listMessages({ data: { threadId } }),
      }),
  },
  routines: {
    one: (routineId: string) =>
      queryOptions({
        queryKey: [QUERY_KEYS.ROUTINES, "one", routineId],
        queryFn: () => vendorActions.getRoutine({ data: { routineId } }),
      }),
    list: () =>
      queryOptions({
        queryKey: [QUERY_KEYS.ROUTINES, "list"],
        queryFn: () => vendorActions.listRoutines(),
      }),
  },
};

export const invalidators = {
  chats: {
    create: (qc: QueryClient, { chat }: { chat: ChatThreadRow }) => {
      qc.setQueryData(getters.chats.list().queryKey, (oldData) => {
        if (!oldData) return oldData;
        return [...oldData, chat];
      });
      qc.setQueryData(getters.chats.messages(chat.id).queryKey, []);

      if (typeof window !== "undefined") {
        window.localStorage.setItem("recent_chat", chat.id);
      }
    },
    delete: (
      qc: QueryClient,
      { threadId, curThreadId }: { threadId: string; curThreadId: string | null },
    ) => {
      qc.setQueryData(getters.chats.list().queryKey, (oldData) => {
        if (!oldData) return oldData;
        return oldData.filter((d) => d.id !== threadId);
      });
      qc.removeQueries({
        queryKey: getters.chats.messages(threadId).queryKey,
        exact: true,
      });
      if (typeof window !== "undefined" && threadId === curThreadId) {
        window.localStorage.removeItem("recent_chat");
      }
    },
    approval: (qc: QueryClient) => {
      // blanket "approval" pipeline via chat. Just assume we don't know what's being approved, but it could
      // mutate existing activities, create new ones, delete some.
      qc.invalidateQueries({
        queryKey: [QUERY_KEYS.CALENDAR],
        exact: false,
      });
      qc.invalidateQueries({
        queryKey: [QUERY_KEYS.DAYS],
        exact: false,
      });
    },
    message: (
      qc: QueryClient,
      { threadId, message }: { threadId: string; message: ChatMessageItem },
    ) => {
      qc.setQueryData(getters.chats.messages(threadId).queryKey, (oldData) => {
        if (!oldData) return oldData;
        if (oldData.some((m) => m.id === message.id)) return oldData;
        return [...oldData, message];
      });
    },
    proposal: (
      qc: QueryClient,
      { threadId, status }: { threadId: string; status: ChatProposal["status"] },
    ) => {
      qc.setQueryData(getters.chats.messages(threadId).queryKey, (oldData) => {
        if (!oldData) return oldData;
        return oldData.map((m) => {
          if (!m.proposalSet) return m;
          return {
            ...m,
            proposalSet: m.proposalSet.map((p) => ({ ...p, status })),
          };
        });
      });
    },
  },
  events: {
    create: (qc: QueryClient, { event }: { event: SportEventRow }) => {
      qc.setQueryData(getters.events.list().queryKey, (oldData) => {
        if (!oldData) return [event];
        return [...oldData, event].sort((a, b) => a.eventDayKey.localeCompare(b.eventDayKey));
      });
    },
    update: (qc: QueryClient, { event }: { event: SportEventRow }) => {
      qc.setQueryData(getters.events.list().queryKey, (oldData) => {
        if (!oldData) return oldData;
        return oldData
          .map((row) => (row.id === event.id ? event : row))
          .sort((a, b) => a.eventDayKey.localeCompare(b.eventDayKey));
      });
    },
    delete: (qc: QueryClient, { id }: { id: string }) => {
      qc.setQueryData(getters.events.list().queryKey, (oldData) => {
        if (!oldData) return oldData;
        return oldData.filter((event) => event.id !== id);
      });
    },
  },
  activities: {
    refresh: (qc: QueryClient) => {
      qc.invalidateQueries({
        queryKey: [QUERY_KEYS.CALENDAR],
        exact: false,
        stale: false,
      });
      qc.invalidateQueries({
        queryKey: [QUERY_KEYS.DAYS],
        exact: false,
        stale: false,
      });
      qc.invalidateQueries({
        queryKey: [QUERY_KEYS.ACTIVITIES],
        exact: false,
        stale: false,
      });
      qc.invalidateQueries({
        queryKey: [QUERY_KEYS.VISUAL],
        exact: false,
        stale: false,
      });
      qc.invalidateQueries({
        queryKey: [QUERY_KEYS.ROUTINES],
        exact: false,
        stale: false,
      });
    },
    link: (qc: QueryClient, { plan }: { plan: WorkoutEntryWithCompleted }) => {
      // workout entry may or may not have already existed. vendor activity did exist (we either
      // link or create a new record).

      // we can't mutate this, record was created or mutated.
      qc.invalidateQueries({
        queryKey: [QUERY_KEYS.ACTIVITIES, "list"],
        exact: false,
      });

      qc.setQueriesData(
        {
          queryKey: [QUERY_KEYS.CALENDAR],
          exact: false,
        },
        (oldData: CalendarPageItem[] | undefined): CalendarPageItem[] | undefined => {
          if (!oldData) return oldData;
          return oldData.map((page) => {
            if (page.dayKey !== plan.dayKey) {
              return page;
            }
            return {
              ...page,
              activities: page.activities.map((activity) => {
                if (activity.id === plan.id) {
                  return plan;
                }
                return activity;
              }),
            };
          });
        },
      );

      qc.setQueryData(getters.activities.unlinked().queryKey, (oldData) => {
        if (!oldData) return oldData;
        return oldData.filter((d) => d.id !== plan.vendorActivityId);
      });

      qc.setQueryData(getters.calendar.day(plan.dayKey).queryKey, (oldData) => {
        if (!oldData) return oldData;
        const didWorkoutExist = oldData.activities.some((activity) => activity.id === plan.id);
        const newLinks = oldData.linkCandidates.filter((link) => {
          return link.id !== plan.vendorActivityId;
        });

        const newItem: DayItem = {
          ...oldData,
          linkCandidates: newLinks,
        };

        if (didWorkoutExist) {
          newItem.activities = oldData.activities.map((activity) => {
            if (activity.id === plan.id) {
              return plan;
            }
            return activity;
          });
        } else {
          newItem.activities = [...oldData.activities, plan];
        }

        return newItem;
      });

      qc.invalidateQueries({
        queryKey: [QUERY_KEYS.VISUAL, "stacked"],
        predicate: (query) => {
          const data = query.state.data as StackedVizResult[] | undefined;
          if (!data) return false;
          return data.some((d) => d.date == plan.dayKey);
        },
      });

      qc.invalidateQueries({
        queryKey: [QUERY_KEYS.VISUAL, "activity"],
        predicate: (query) => {
          const data = query.state.data as VizResult[] | undefined;
          if (!data) return false;
          return data.some((d) => d.date == plan.dayKey);
        },
      });
    },
    update: (qc: QueryClient, { plan }: { plan: WorkoutEntryWithCompleted }) => {
      // we don't allow for updating day or activity kind in the UI. That'd be a delete + add.
      qc.setQueriesData(
        {
          queryKey: [QUERY_KEYS.ACTIVITIES, "list"],
          exact: false,
        },
        (oldData: PlannedWorkoutsPageResult | undefined): PlannedWorkoutsPageResult | undefined => {
          if (!oldData) return oldData;
          return {
            ...oldData,
            rows: oldData.rows.map((activity) => {
              if (activity.id === plan.id) {
                return plan;
              }
              return activity;
            }),
          };
        },
      );

      qc.setQueryData(getters.calendar.day(plan.dayKey).queryKey, (oldData) => {
        if (!oldData) return oldData;
        return {
          ...oldData,
          activities: oldData.activities.map((activity) => {
            if (activity.id === plan.id) {
              return plan;
            }
            return activity;
          }),
        };
      });

      qc.setQueriesData(
        {
          queryKey: [QUERY_KEYS.CALENDAR],
          exact: false,
        },
        (oldData: CalendarPageItem[] | undefined): CalendarPageItem[] | undefined => {
          if (!oldData) return oldData;
          return oldData.map((page) => {
            if (page.dayKey !== plan.dayKey) {
              return page;
            }
            return {
              ...page,
              activities: page.activities.map((activity) => {
                if (activity.id === plan.id) {
                  return plan;
                }
                return activity;
              }),
            };
          });
        },
      );

      // you can't use a predicate, since status updates alter the data we fetch,
      // and we don't know if the dayKey already existed
      qc.invalidateQueries({
        queryKey: [QUERY_KEYS.VISUAL, "stacked"],
        exact: false,
      });

      qc.invalidateQueries({
        queryKey: [QUERY_KEYS.VISUAL, "activity"],
        exact: false,
      });
    },
    delete: (qc: QueryClient, { plan }: { plan: WorkoutEntryWithCompleted }) => {
      // we don't allow for updating day or activity kind in the UI. That'd be a delete + add.
      qc.setQueriesData(
        {
          queryKey: [QUERY_KEYS.ACTIVITIES, "list"],
          exact: false,
        },
        (oldData: PlannedWorkoutsPageResult | undefined): PlannedWorkoutsPageResult | undefined => {
          if (!oldData) return oldData;
          return {
            ...oldData,
            rows: oldData.rows.filter((activity) => activity.id !== plan.id),
          };
        },
      );
      qc.setQueryData(getters.calendar.day(plan.dayKey).queryKey, (oldData) => {
        if (!oldData) return oldData;
        return {
          ...oldData,
          activities: oldData.activities.filter((activity) => activity.id !== plan.id),
        };
      });

      qc.setQueriesData(
        {
          queryKey: [QUERY_KEYS.CALENDAR],
          exact: false,
        },
        (oldData: CalendarPageItem[] | undefined): CalendarPageItem[] | undefined => {
          if (!oldData) return oldData;
          return oldData.map((page) => {
            if (page.dayKey !== plan.dayKey) {
              return page;
            }
            return {
              ...page,
              activities: page.activities.filter((activity) => activity.id !== plan.id),
            };
          });
        },
      );

      qc.invalidateQueries({
        queryKey: [QUERY_KEYS.VISUAL, "stacked"],
        predicate: (query) => {
          const data = query.state.data as StackedVizResult[] | undefined;
          if (!data) return false;
          return data.some((d) => d.date == plan.dayKey);
        },
      });

      qc.invalidateQueries({
        queryKey: [QUERY_KEYS.VISUAL, "activity"],
        predicate: (query) => {
          const data = query.state.data as VizResult[] | undefined;
          if (!data) return false;
          return data.some((d) => d.date == plan.dayKey);
        },
      });
    },
    create: (qc: QueryClient, { plan }: { plan: WorkoutEntryWithCompleted }) => {
      // paginated, so cannot mutate in place.
      qc.invalidateQueries({
        queryKey: [QUERY_KEYS.ACTIVITIES, "list"],
        exact: false,
      });

      qc.invalidateQueries({
        queryKey: [QUERY_KEYS.VISUAL, "stacked"],
        predicate: (query) => {
          const data = query.state.data as StackedVizResult[] | undefined;
          if (!data) return false;
          return data.some((d) => d.date == plan.dayKey);
        },
      });

      qc.invalidateQueries({
        queryKey: [QUERY_KEYS.VISUAL, "activity"],
        predicate: (query) => {
          const data = query.state.data as VizResult[] | undefined;
          if (!data) return false;
          return data.some((d) => d.date == plan.dayKey);
        },
      });

      qc.setQueryData(getters.calendar.day(plan.dayKey).queryKey, (oldData) => {
        if (!oldData) return oldData;
        return {
          ...oldData,
          activities: [...oldData.activities, plan],
        };
      });

      qc.setQueriesData(
        {
          queryKey: [QUERY_KEYS.CALENDAR],
          exact: false,
        },
        (oldData: CalendarPageItem[] | undefined): CalendarPageItem[] | undefined => {
          if (!oldData) return oldData;
          return oldData.map((page) => {
            if (page.dayKey !== plan.dayKey) {
              return page;
            }
            return {
              ...page,
              activities: [...page.activities, plan],
            };
          });
        },
      );
    },
  },
  weights: {
    set: (qc: QueryClient, { dayKey, weightLb }: { dayKey: string; weightLb: number }) => {
      qc.setQueryData(getters.calendar.day(dayKey).queryKey, (oldData) => {
        if (!oldData) return oldData;
        return {
          ...oldData,
          weight: weightLb,
        };
      });
      qc.setQueriesData(
        {
          queryKey: [QUERY_KEYS.CALENDAR],
          exact: false,
        },
        (oldData: CalendarPageItem[] | undefined): CalendarPageItem[] | undefined => {
          if (!oldData) return oldData;
          return oldData.map((page) => {
            if (page.dayKey !== dayKey) {
              return page;
            }
            return {
              ...page,
              hasWeight: true,
            };
          });
        },
      );

      // we don't know if the weight dayKey as already in the response.
      qc.invalidateQueries({
        queryKey: [QUERY_KEYS.VISUAL, "weight"],
        exact: false,
      });
    },
    delete: (qc: QueryClient, { dayKey }: { dayKey: string }) => {
      qc.setQueryData(getters.calendar.day(dayKey).queryKey, (oldData) => {
        if (!oldData) return oldData;
        return {
          ...oldData,
          weight: undefined,
        };
      });
      qc.setQueriesData(
        {
          queryKey: [QUERY_KEYS.CALENDAR],
          exact: false,
        },
        (oldData: CalendarPageItem[] | undefined): CalendarPageItem[] | undefined => {
          if (!oldData) return oldData;
          return oldData.map((page) => {
            if (page.dayKey !== dayKey) {
              return page;
            }
            return {
              ...page,
              hasWeight: false,
            };
          });
        },
      );

      qc.setQueriesData(
        {
          queryKey: [QUERY_KEYS.VISUAL, "weight"],
          exact: false,
        },
        (oldData: VizResult[] | undefined): VizResult[] | undefined => {
          if (!oldData) return oldData;
          return oldData.filter((d) => d.date !== dayKey);
        },
      );
    },
  },
};
