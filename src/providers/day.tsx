import { useMutation, useQuery } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { type ReactNode, useEffect, useEffectEvent } from "react";
import queryKeys from "@/lib/query-keys";
import { cookieActions } from "@/server-fcts/cookies";

export const DayProvider = ({ children }: { children: ReactNode }) => {
  const router = useRouter();
  const updateTimeZone = useServerFn(cookieActions.setTimezone);

  const tzQuery = useQuery({
    queryKey: queryKeys.timezone,
    queryFn: () => cookieActions.getTimezone(),
  });

  const updateTimeZoneMutation = useMutation({
    mutationFn: (tz: string) => updateTimeZone({ data: { timezone: tz } }),
    onSuccess: () => {
      router.invalidate();
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
    onTimezoneCheck(tzQuery.data);
  }, [tzQuery.data]);

  return children;
};
