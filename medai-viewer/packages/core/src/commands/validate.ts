import type { JsonSchema } from './types';

/**
 * Validate `value` against the JSON-schema subset used by commands.
 * Returns a list of human-readable problems; empty means valid.
 * Deliberately small: types, required, enum, numeric bounds, nested objects/arrays.
 */
export function validateAgainstSchema(value: unknown, schema: JsonSchema, path = '$'): string[] {
  const problems: string[] = [];

  if (schema.enum && !schema.enum.includes(value as string | number | boolean)) {
    problems.push(`${path}: expected one of ${schema.enum.map(String).join(', ')}`);
    return problems;
  }

  switch (schema.type) {
    case 'object': {
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        problems.push(`${path}: expected object`);
        return problems;
      }
      const obj = value as Record<string, unknown>;
      for (const key of schema.required ?? []) {
        if (!(key in obj)) problems.push(`${path}.${key}: required`);
      }
      for (const [key, sub] of Object.entries(schema.properties ?? {})) {
        if (key in obj && obj[key] !== undefined) {
          problems.push(...validateAgainstSchema(obj[key], sub, `${path}.${key}`));
        }
      }
      if (schema.additionalProperties === false) {
        for (const key of Object.keys(obj)) {
          if (!(key in (schema.properties ?? {}))) problems.push(`${path}.${key}: unexpected property`);
        }
      }
      return problems;
    }
    case 'array': {
      if (!Array.isArray(value)) {
        problems.push(`${path}: expected array`);
        return problems;
      }
      if (schema.items) {
        value.forEach((item, i) => problems.push(...validateAgainstSchema(item, schema.items!, `${path}[${i}]`)));
      }
      return problems;
    }
    case 'string':
      if (typeof value !== 'string') problems.push(`${path}: expected string`);
      return problems;
    case 'number':
    case 'integer': {
      if (typeof value !== 'number' || Number.isNaN(value)) {
        problems.push(`${path}: expected ${schema.type}`);
        return problems;
      }
      if (schema.type === 'integer' && !Number.isInteger(value)) problems.push(`${path}: expected integer`);
      if (schema.minimum !== undefined && value < schema.minimum) problems.push(`${path}: must be >= ${schema.minimum}`);
      if (schema.maximum !== undefined && value > schema.maximum) problems.push(`${path}: must be <= ${schema.maximum}`);
      return problems;
    }
    case 'boolean':
      if (typeof value !== 'boolean') problems.push(`${path}: expected boolean`);
      return problems;
    case 'null':
      if (value !== null) problems.push(`${path}: expected null`);
      return problems;
    default:
      return problems; // untyped schema accepts anything
  }
}
