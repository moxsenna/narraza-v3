/** Minimal structural JSON value type; keeps packages/ai free of app imports. */
export type JsonObject = { [key: string]: JsonValue };
export type JsonValue = string | number | boolean | null | JsonObject | JsonValue[];
