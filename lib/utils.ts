import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatMoney(amount: number, currency: string = "GHS") {
  return new Intl.NumberFormat("en-GH", {
    style: "currency",
    currency: currency,
  }).format(amount);
}

export function formatCedi(amount: number) {
  return formatMoney(amount, "GHS");
}
