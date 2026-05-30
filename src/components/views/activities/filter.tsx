import type { ReactNode } from "react";
import { SelectChevron } from "@/components/assets";

export const FilterSelect: React.FC<{
  value: string;
  onChange: (value: string) => void;
  ariaLabelledBy: string;
  children: ReactNode;
}> = ({ value, onChange, ariaLabelledBy, children }) => {
  return (
    <div className="relative inline-flex min-w-0">
      <select
        aria-labelledby={ariaLabelledBy}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 w-full min-w-25 max-w-40 cursor-pointer appearance-none rounded border border-zinc-700/80 bg-zinc-900 py-0 pl-2 pr-7 text-xs text-zinc-100 focus:border-emerald-600/60 focus:outline-none focus:ring-2 focus:ring-emerald-500/25"
      >
        {children}
      </select>
      <SelectChevron />
    </div>
  );
};
