function randomHex(length: number) {
  const cryptoApi = globalThis.crypto;
  if (typeof cryptoApi?.getRandomValues === "function") {
    const values = cryptoApi.getRandomValues(new Uint8Array(length));
    return Array.from(values, value => value.toString(16).padStart(2, "0")).join("").slice(0, length);
  }
  return Array.from({ length }, () => Math.floor(Math.random() * 16).toString(16)).join("");
}

function createUuidFallback() {
  const raw = `${Date.now().toString(16).padStart(12, "0")}${randomHex(20)}`.slice(0, 32).split("");
  raw[12] = "4";
  raw[16] = ((parseInt(raw[16], 16) & 0x3) | 0x8).toString(16);
  return `${raw.slice(0, 8).join("")}-${raw.slice(8, 12).join("")}-${raw.slice(12, 16).join("")}-${raw.slice(16, 20).join("")}-${raw.slice(20, 32).join("")}`;
}

export function createSafeId(_prefix = "id"): string {
  const cryptoApi = globalThis.crypto;
  if (typeof cryptoApi?.randomUUID === "function") {
    return cryptoApi.randomUUID();
  }
  return createUuidFallback();
}
