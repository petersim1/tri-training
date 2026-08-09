import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { type ReactNode, useEffect, useEffectEvent } from "react";
import { getters } from "@/lib/query-keys";
import { cookieActions } from "@/server-fcts/cookies";

export const DayProvider = ({ children }: { children: ReactNode }) => {
  const qc = useQueryClient();
  const updateTimeZone = useServerFn(cookieActions.setTimezone);

  const { data: tz } = useSuspenseQuery(getters.calendar.timezone());

  const updateTimeZoneMutation = useMutation({
    mutationFn: (tz: string) => updateTimeZone({ data: { timezone: tz } }),
    onMutate: () => {
      qc.cancelQueries();
    },
    onSuccess: () => {
      window.location.reload();
    },
  });

  const onTimezoneCheck = useEffectEvent((serverTz: string | undefined) => {
    const clientTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (serverTz && clientTimeZone !== serverTz) {
      updateTimeZoneMutation.mutate(clientTimeZone);
    }
  });

  useEffect(() => {
    onTimezoneCheck(tz);
  }, [tz]);

  return children;
};
