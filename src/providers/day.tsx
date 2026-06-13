import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";

export type DayContextValue = {
  todayKey: string;
  timeZone: string;
};

export const DayContext = createContext<DayContextValue | null>(null);

const getTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
const getToday = (timeZone: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date());

export const DayProvider = ({ children }: { children: ReactNode }) => {
  const [timeZone, setTimeZone] = useState(getTimeZone());
  const [todayKey, setTodayKey] = useState(getToday(timeZone));

  useEffect(() => {
    const clientTimeZone = getTimeZone();
    setTimeZone(clientTimeZone);
    setTodayKey(getToday(clientTimeZone));
  }, []);

  return (
    <DayContext.Provider value={{ todayKey, timeZone }}>
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
