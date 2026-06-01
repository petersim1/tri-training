import { createIsomorphicFn } from "@tanstack/react-start";
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export const cn = (...inputs: ClassValue[]): string => {
  return twMerge(clsx(inputs));
};

export const logMessage = createIsomorphicFn()
  .server((...msg) => console.log(`[SERVER]: ${msg}`))
  .client((...msg) => console.log(`[CLIENT]: ${msg}`));
