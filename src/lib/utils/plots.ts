export const PAD_L = 52;
export const PAD_R = 20;
export const PAD_T = 32;
export const PAD_B = 36;
export const VIEW_W = 800;
export const VIEW_H = 280;

export const monthLabel = (d: Date, showYear: boolean) =>
  d.toLocaleDateString(undefined, {
    month: "short",
    ...(showYear ? { year: "numeric" } : {}),
  });

export const shortDateLabel = (date: string, showYear: boolean) => {
  const d = new Date(`${date}T12:00:00`);
  return Number.isNaN(d.getTime())
    ? date
    : d.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        ...(showYear ? { year: "numeric" } : {}),
      });
};
