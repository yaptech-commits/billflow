// BillFlow runtime safety: use Web Crypto when available, with a collision-resistant fallback for older Safari/WebViews.
export function createSafeId(prefix = "id"): string {
  const cryptoApi = globalThis.crypto;
  if (typeof cryptoApi?.randomUUID === "function") {
    return cryptoApi.randomUUID();
  }

  const randomPart = typeof cryptoApi?.getRandomValues === "function"
    ? Array.from(cryptoApi.getRandomValues(new Uint32Array(2))).map(value => value.toString(36)).join("")
    : Math.random().toString(36).slice(2);

  return `${prefix}-${Date.now().toString(36)}-${randomPart}`;
}
