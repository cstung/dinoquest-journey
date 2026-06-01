import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const xpNumberFormatter = new Intl.NumberFormat("en-US");

export function formatXp(value: number): string {
  if (!Number.isFinite(value)) {
    return "0";
  }
  return xpNumberFormatter.format(Math.trunc(value));
}
