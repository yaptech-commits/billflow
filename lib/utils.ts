import { clsx, type ClassValue } from "clsx";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

import { CURRENCIES, DEFAULT_CURRENCY } from "./db";

export function formatMoney(amount: number, currencyCode: string = DEFAULT_CURRENCY) {
  const currency = CURRENCIES[currencyCode as keyof typeof CURRENCIES] || CURRENCIES[DEFAULT_CURRENCY];
  return `${currency.symbol} ${amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Backward-compatible alias — pages that haven't migrated to multi-currency yet. */
export function formatCedi(amount: number) {
  return formatMoney(amount, "GHS");
}

export function generateVoucherCode(prefix = "BF") {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return `${prefix}-${code}`;
}

export function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export const AVATAR_COLORS = [
  "#F5A623", "#00D68F", "#4A9EFF",
  "#FF4D6D", "#9B59B6", "#1ABC9C",
];

export function getAvatarColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}
