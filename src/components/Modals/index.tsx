import type React from "react";
import { useEffect } from "react";
import { cn } from "@/lib/utils";

type ModalProps = React.HTMLAttributes<HTMLDivElement> & {
  children: React.ReactNode;
  onClose: () => void;
};

export const Modal: React.FC<ModalProps> = ({
  className,
  children,
  onClose,
  ...props
}) => {
  useEffect(() => {
    document.body.classList.add("overflow-hidden");
    return () => document.body.classList.remove("overflow-hidden");
  }, []);
  return (
    <div
      className={cn(
        "fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center",
        className,
      )}
      {...props}
    >
      <button
        type="button"
        aria-label="Close dialog"
        className="absolute inset-0 cursor-default border-0 bg-black/60 p-0"
        onClick={onClose}
      />
      {children}
    </div>
  );
};

export const ModalContent: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  className,
  ...props
}) => (
  <div
    role="dialog"
    aria-modal="true"
    className={cn(
      "relative z-10 max-h-[90vh] w-full sm:max-w-md overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-950 p-4 shadow-xl animate-appear",
      className,
    )}
    {...props}
  />
);
