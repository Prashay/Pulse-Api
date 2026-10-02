const assert = require("assert");

// Test regex for UUID v4
const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

console.log("Running Postman features verification tests...\n");

// 1. Test generateRandomGuid and dynamic variable resolution
function generateRandomGuid() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

const guid1 = generateRandomGuid();
const guid2 = generateRandomGuid();

console.log("Generated GUID 1:", guid1);
console.log("Generated GUID 2:", guid2);

assert(UUID_V4_REGEX.test(guid1), `guid1 "${guid1}" is not a valid UUID v4`);
assert(UUID_V4_REGEX.test(guid2), `guid2 "${guid2}" is not a valid UUID v4`);
assert.notStrictEqual(guid1, guid2, "Two generated GUIDs should be unique and random");
console.log("✓ Dynamic variable {{$guid}} generates valid, unique UUIDs");

// 2. Test interpolate with {{$guid}} and headers
function interpolate(text, env, collection) {
  if (!text || typeof text !== "string") return text || "";
  if (!text.includes("{{")) return text;

  let result = text;
  for (let round = 0; round < 5; round++) {
    if (!result.includes("{{")) break;
    let changed = false;
    result = result.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (match, raw) => {
      const varName = String(raw).trim().toLowerCase();
      if (varName === "$guid" || varName === "$randomuuid") {
        changed = true;
        return generateRandomGuid();
      }
      return match;
    });
    if (!changed) break;
  }
  return result;
}

const headerVal1 = interpolate("{{$guid}}", null, null);
const headerVal2 = interpolate("{{$guid}}", null, null);
const prefixed = interpolate("key-{{$guid}}", null, null);

console.log("Header api-key interpolated 1:", headerVal1);
console.log("Header api-key interpolated 2:", headerVal2);
console.log("Header with prefix:", prefixed);

assert(UUID_V4_REGEX.test(headerVal1), "Interpolated header value is not a valid UUID v4");
assert(UUID_V4_REGEX.test(headerVal2), "Interpolated header value 2 is not a valid UUID v4");
assert.notStrictEqual(headerVal1, headerVal2, "Consecutive header sends must generate different random values");
assert(prefixed.startsWith("key-"), "Prefixed header value must start with key-");
console.log("✓ Header api-key -> {{$guid}} resolution works properly");

// 3. Test Bulk Edit parser and serializer
function serializeRows(rows) {
  return rows
    .filter((r) => r.key.trim() || r.value.trim())
    .map((r) => (r.enabled ? `${r.key}: ${r.value}` : `// ${r.key}: ${r.value}`))
    .join("\n");
}

function parseText(text, currentRows = []) {
  const lines = text.split("\n");
  const result = [];
  const usedIds = new Set();

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    let enabled = true;
    let content = line;

    if (content.startsWith("//") || content.startsWith("#")) {
      enabled = false;
      content = content.replace(/^(\/\/|#)\s*/, "").trim();
    }

    let key = "";
    let value = "";
    const colonIdx = content.indexOf(":");
    if (colonIdx >= 0) {
      key = content.slice(0, colonIdx).trim();
      value = content.slice(colonIdx + 1).trim();
    } else {
      key = content;
      value = "";
    }

    const existing = currentRows.find(
      (r) => r.key.toLowerCase() === key.toLowerCase() && !usedIds.has(r.id)
    );
    const rowId = existing ? existing.id : `kv_${Math.random()}`;
    usedIds.add(rowId);

    result.push({
      id: rowId,
      key,
      value,
      enabled,
    });
  }

  return result;
}

const sampleRows = [
  { id: "1", key: "Content-Type", value: "application/json", enabled: true },
  { id: "2", key: "api-key", value: "{{$guid}}", enabled: true },
  { id: "3", key: "Authorization", value: "Bearer token123", enabled: false },
];

const bulkText = serializeRows(sampleRows);
console.log("\nSerialized bulk text:\n" + bulkText);

assert(bulkText.includes("Content-Type: application/json"));
assert(bulkText.includes("api-key: {{$guid}}"));
assert(bulkText.includes("// Authorization: Bearer token123"));

const parsed = parseText(bulkText, sampleRows);
console.log("\nParsed back rows count:", parsed.length);
assert.strictEqual(parsed.length, 3);
assert.strictEqual(parsed[0].key, "Content-Type");
assert.strictEqual(parsed[0].value, "application/json");
assert.strictEqual(parsed[0].enabled, true);
assert.strictEqual(parsed[1].key, "api-key");
assert.strictEqual(parsed[1].value, "{{$guid}}");
assert.strictEqual(parsed[1].enabled, true);
assert.strictEqual(parsed[2].key, "Authorization");
assert.strictEqual(parsed[2].value, "Bearer token123");
assert.strictEqual(parsed[2].enabled, false);
console.log("✓ Bulk Edit serialization and parsing roundtrip verified!");

console.log("\nAll Postman feature tests passed successfully!");
