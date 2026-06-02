// ui/field.tsx
import { cn } from "@/lib/utils";

export const Label: React.FC<React.LabelHTMLAttributes<HTMLLabelElement>> = ({
  className,
  ...props
}) => (
  // biome-ignore lint/a11y/noLabelWithoutControl: <>
  <label
    className={cn(
      "text-xs font-medium uppercase tracking-wider text-zinc-500",
      className,
    )}
    {...props}
  />
);

type WithError = { isError?: boolean };

const errorClass =
  "border-rose-500/70 focus:border-rose-500/70 focus:ring-rose-500/25";
const baseClass =
  "w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1 text-zinc-100 placeholder:text-zinc-600 focus:border-emerald-500/70 focus:outline-none focus:ring-2 focus:ring-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-50";

export const Input: React.FC<
  React.InputHTMLAttributes<HTMLInputElement> & WithError
> = ({ className, isError, ...props }) => (
  <input
    className={cn("h-8", baseClass, isError && errorClass, className)}
    {...props}
  />
);

export const Select: React.FC<
  React.SelectHTMLAttributes<HTMLSelectElement> & WithError
> = ({ className, isError, children, ...props }) => (
  <select
    className={cn("h-8", baseClass, isError && errorClass, className)}
    {...props}
  >
    {children}
  </select>
);

export const Textarea: React.FC<
  React.TextareaHTMLAttributes<HTMLTextAreaElement> & WithError
> = ({ className, isError, ...props }) => (
  <textarea
    className={cn(baseClass, isError && errorClass, className)}
    {...props}
  />
);

export const Field: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  className,
  ...props
}) => <div className={cn("flex flex-col gap-1", className)} {...props} />;
