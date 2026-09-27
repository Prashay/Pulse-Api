export function uid(prefix = "id"): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}

export function kv(key = "", value = "", enabled = true): import("./types").KeyValue {
  return { id: uid("kv"), key, value, enabled };
}
