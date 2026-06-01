export type ChartDimensions = {
  viewH: number;
  viewW: number;
  nTicks: {
    y: number;
    x: number;
  };
  fontSize: {
    axis: number;
    label: number;
    tooltip: number;
  };
  dotRadius: number;
  strokeWidth: number;
  pad: {
    l: number;
    r: number;
    t: number;
    b: number;
  };
};

export const getDimensions = (containerWidth: number): ChartDimensions => {
  if (containerWidth < 400) {
    return {
      viewH: 400,
      viewW: 500,
      nTicks: {
        y: 3,
        x: 3,
      },
      fontSize: { axis: 16, label: 14, tooltip: 18 },
      dotRadius: 5,
      strokeWidth: 2.5,
      pad: { l: 72, r: 40, t: 40, b: 48 },
    };
  }
  if (containerWidth < 640) {
    return {
      viewH: 340,
      viewW: 640,
      nTicks: {
        y: 4,
        x: 4,
      },
      fontSize: { axis: 14, label: 12, tooltip: 16 },
      dotRadius: 4,
      strokeWidth: 2,
      pad: { l: 62, r: 40, t: 36, b: 42 },
    };
  }
  return {
    viewH: 280,
    viewW: 800,
    nTicks: {
      y: 5,
      x: 5,
    },
    fontSize: { axis: 11, label: 10, tooltip: 12 },
    dotRadius: 3,
    strokeWidth: 2,
    pad: { l: 56, r: 40, t: 32, b: 36 },
  };
};

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
