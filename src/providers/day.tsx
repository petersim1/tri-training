import { createContext, type ReactNode, useContext, useMemo } from "react";

export type DayContextValue = {
  todayKey: string;
  timeZone: string;
};

export const DayContext = createContext<DayContextValue | null>(null);

export const DayProvider = ({ children }: { children: ReactNode }) => {
  const timeZone = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    [],
  );

  const todayKey = useMemo(
    () => new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date()),
    [timeZone],
  );

  return (
    <DayContext.Provider
      value={{
        todayKey,
        timeZone,
      }}
    >
      {children}
    </DayContext.Provider>
  );
};

export const useDay = (): DayContextValue => {
  const v = useContext(DayContext);
  if (!v) {
    throw new Error("useDay outside DayProvider");
  }
  return v;
};
