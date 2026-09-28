/**
 * The OpenAPI 3.1 schema subset the backend's snapshot actually uses.
 *
 * No validator dependency: `npm run test:parity` runs in a CI job with no
 * `npm ci`, and a transitive `ajv` is not ours to rely on. So this implements
 * exactly the keywords FastAPI/pydantic emit into the snapshot — and THROWS on
 * any other. A refreshed snapshot that starts using `oneOf` or `format` makes
 * the check fail loudly instead of silently ignoring the new constraint;
 * `assertSupported` walks a whole document to prove coverage up front.
 *
 * Validation keywords: type, $ref (local), anyOf, properties, required,
 * additionalProperties (boolean or schema), items, prefixItems, minItems,
 * maxItems, enum, const, pattern, minLength, maxLength, minimum, maximum,
 * exclusiveMinimum. Annotations (ignored): title, description, default,
 * readOnly, examples, deprecated.
 */
import {
  childPath,
  jsonType,
  readWildcard,
  valueHasType,
} from "./wildcard.mjs";

export class UnsupportedSchemaError extends Error {}

const VALIDATION = new Set([
  "type",
  "$ref",
  "anyOf",
  "properties",
  "required",
  "additionalProperties",
  "items",
  "prefixItems",
  "minItems",
  "maxItems",
  "enum",
  "const",
  "pattern",
  "minLength",
  "maxLength",
  "minimum",
  "maximum",
  "exclusiveMinimum",
]);
const ANNOTATIONS = new Set([
  "title",
  "description",
  "default",
  "readOnly",
  "examples",
  "deprecated",
]);

/**
 * How a value that stands for "some value" presents itself to the validator.
 *   types: the types it claims, or null to take the schema's.
 *
 * @typedef {(value: unknown) => { types: Set<string> | null, label: string } | null} WildcardReader
 */

/** Documented-response wildcards, `"<...>"` (see wildcard.mjs). */
export const docWildcards = (value) => {
  const w = readWildcard(value);
  if (w === null) return null;
  return {
    types: w.tag === null ? null : new Set([w.tag]),
    label: `<${w.text}>`,
  };
};

/**
 * @param {Record<string, any>} root  the OpenAPI document ($refs resolve in it)
 */
export function createValidator(root) {
  /** @param {string} ref */
  function deref(ref) {
    if (!ref.startsWith("#/"))
      throw new UnsupportedSchemaError(`non-local $ref ${ref}`);
    let node = root;
    for (const part of ref.slice(2).split("/")) {
      const key = part.replaceAll("~1", "/").replaceAll("~0", "~");
      if (
        node === null ||
        typeof node !== "object" ||
        !Object.hasOwn(node, key)
      ) {
        throw new UnsupportedSchemaError(`unresolvable $ref ${ref}`);
      }
      node = node[key];
    }
    return node;
  }

  /** @param {any} schema @param {string} where */
  function checkKeywords(schema, where) {
    if (typeof schema === "boolean") return;
    if (
      schema === null ||
      typeof schema !== "object" ||
      Array.isArray(schema)
    ) {
      throw new UnsupportedSchemaError(`not a schema at ${where}`);
    }
    for (const key of Object.keys(schema)) {
      if (!VALIDATION.has(key) && !ANNOTATIONS.has(key)) {
        throw new UnsupportedSchemaError(
          `unsupported schema keyword "${key}" at ${where}`,
        );
      }
    }
  }

  /**
   * The JSON types a schema admits, or null for "any".
   *
   * @param {any} schema
   * @param {Set<string>} [seen]
   * @returns {Set<string> | null}
   */
  function schemaTypes(schema, seen = new Set()) {
    if (schema === true || schema === undefined) return null;
    if (schema === false) return new Set();
    checkKeywords(schema, "(types)");
    /** @type {Set<string> | null} */
    let types = null;
    const narrow = (other) => {
      if (other === null) return;
      types =
        types === null
          ? new Set(other)
          : new Set([...types].filter((t) => other.has(t)));
    };
    if (schema.$ref !== undefined) {
      if (!seen.has(schema.$ref))
        narrow(
          schemaTypes(deref(schema.$ref), new Set([...seen, schema.$ref])),
        );
    }
    if (schema.type !== undefined) {
      const own = new Set(
        Array.isArray(schema.type) ? schema.type : [schema.type],
      );
      if (own.has("number")) own.add("integer");
      narrow(own);
    }
    if (schema.anyOf !== undefined) {
      /** @type {Set<string> | null} */
      let union = new Set();
      for (const branch of schema.anyOf) {
        const t = schemaTypes(branch, seen);
        if (t === null) {
          union = null;
          break;
        }
        for (const x of t) union.add(x);
      }
      narrow(union);
    }
    if (schema.const !== undefined) narrow(new Set([jsonType(schema.const)]));
    if (schema.enum !== undefined) narrow(new Set(schema.enum.map(jsonType)));
    return types;
  }

  /**
   * @param {any} schema
   * @param {unknown} value
   * @param {{ wildcard?: WildcardReader, path?: string }} [options]
   * @returns {{ errors: { path: string, message: string }[], wildcards: Map<string, Set<string>> }}
   */
  function validate(schema, value, { wildcard = () => null, path = "$" } = {}) {
    /** @type {{ path: string, message: string }[]} */
    const errors = [];
    /** @type {Map<string, Set<string>>} */
    const wildcards = new Map();
    run(schema, value, path, errors, wildcards);
    return { errors, wildcards };

    function run(s, v, at, errs, wild) {
      if (s === true || s === undefined) {
        const w = wildcard(v);
        if (w !== null) wild.set(at, w.types ?? new Set(["string"]));
        return;
      }
      if (s === false) {
        errs.push({ path: at, message: "no value is allowed here" });
        return;
      }
      checkKeywords(s, at);

      const w = wildcard(v);
      if (w !== null) {
        const allowed = schemaTypes(s);
        if (w.types === null) {
          wild.set(at, allowed ?? new Set(["string"]));
          return;
        }
        if (w.types.has("any") || allowed === null) {
          wild.set(at, w.types);
          return;
        }
        /** @type {Set<string>} */
        const fits = new Set();
        for (const t of w.types) {
          if (allowed.has(t)) fits.add(t);
          else if (t === "number" && allowed.has("integer"))
            fits.add("integer");
        }
        if (fits.size === 0) {
          errs.push({
            path: at,
            message: `${w.label} is ${[...w.types].join(" | ")}, but the contract says ${[...allowed].join(" | ")}`,
          });
        } else {
          wild.set(at, fits);
        }
        return;
      }

      if (s.$ref !== undefined) run(deref(s.$ref), v, at, errs, wild);

      if (s.type !== undefined) {
        const types = Array.isArray(s.type) ? s.type : [s.type];
        if (!valueHasType(v, types)) {
          errs.push({
            path: at,
            message: `expected ${types.join(" | ")}, got ${jsonType(v)}`,
          });
          return;
        }
      }
      if (s.const !== undefined && !deepEqual(s.const, v)) {
        errs.push({ path: at, message: `expected ${JSON.stringify(s.const)}` });
      }
      if (s.enum !== undefined && !s.enum.some((e) => deepEqual(e, v))) {
        errs.push({
          path: at,
          message: `${JSON.stringify(v)} is not one of ${JSON.stringify(s.enum)}`,
        });
      }

      if (typeof v === "string") {
        const length = [...v].length;
        if (s.minLength !== undefined && length < s.minLength) {
          errs.push({
            path: at,
            message: `shorter than ${s.minLength} characters`,
          });
        }
        if (s.maxLength !== undefined && length > s.maxLength) {
          errs.push({
            path: at,
            message: `longer than ${s.maxLength} characters`,
          });
        }
        if (s.pattern !== undefined && !new RegExp(s.pattern, "u").test(v)) {
          errs.push({
            path: at,
            message: `${JSON.stringify(v)} does not match ${s.pattern}`,
          });
        }
      }

      if (typeof v === "number") {
        if (s.minimum !== undefined && v < s.minimum) {
          errs.push({
            path: at,
            message: `${v} is below the minimum ${s.minimum}`,
          });
        }
        if (s.maximum !== undefined && v > s.maximum) {
          errs.push({
            path: at,
            message: `${v} is above the maximum ${s.maximum}`,
          });
        }
        if (s.exclusiveMinimum !== undefined && v <= s.exclusiveMinimum) {
          errs.push({
            path: at,
            message: `${v} must be greater than ${s.exclusiveMinimum}`,
          });
        }
      }

      if (Array.isArray(v)) {
        if (s.minItems !== undefined && v.length < s.minItems) {
          errs.push({ path: at, message: `fewer than ${s.minItems} items` });
        }
        if (s.maxItems !== undefined && v.length > s.maxItems) {
          errs.push({ path: at, message: `more than ${s.maxItems} items` });
        }
        // Only a schema that says something about items looks at them: a
        // bare `$ref` wrapper must not re-walk them as unconstrained.
        const prefix = s.prefixItems ?? [];
        if (s.prefixItems !== undefined || s.items !== undefined) {
          v.forEach((item, index) => {
            const itemSchema = index < prefix.length ? prefix[index] : s.items;
            run(itemSchema, item, childPath(at, index), errs, wild);
          });
        }
      }

      if (v !== null && typeof v === "object" && !Array.isArray(v)) {
        const obj = /** @type {Record<string, unknown>} */ (v);
        for (const key of s.required ?? []) {
          if (!Object.hasOwn(obj, key)) {
            errs.push({
              path: childPath(at, key),
              message: "required property is missing",
            });
          }
        }
        const props = s.properties ?? {};
        const describesProperties =
          s.properties !== undefined || s.additionalProperties !== undefined;
        for (const [key, item] of describesProperties
          ? Object.entries(obj)
          : []) {
          const at2 = childPath(at, key);
          if (Object.hasOwn(props, key)) {
            run(props[key], item, at2, errs, wild);
          } else if (s.additionalProperties === false) {
            errs.push({
              path: at2,
              message: "property is not in the contract",
            });
          } else {
            run(s.additionalProperties, item, at2, errs, wild);
          }
        }
      }

      if (s.anyOf !== undefined) {
        const attempts = s.anyOf.map((branch) => {
          const branchErrors = [];
          const branchWild = new Map();
          run(branch, v, at, branchErrors, branchWild);
          return { branchErrors, branchWild };
        });
        const passing = attempts.filter((a) => a.branchErrors.length === 0);
        if (passing.length === 0) {
          const closest = attempts.reduce((a, b) =>
            b.branchErrors.length < a.branchErrors.length ? b : a,
          );
          errs.push({
            path: at,
            message: `matches none of ${s.anyOf.length} alternatives; closest: ${closest.branchErrors
              .map((e) => `${e.path} ${e.message}`)
              .join("; ")}`,
          });
        } else {
          for (const { branchWild } of passing) {
            for (const [p, types] of branchWild) {
              const prior = wild.get(p);
              wild.set(
                p,
                prior === undefined
                  ? new Set(types)
                  : new Set([...prior, ...types]),
              );
            }
          }
        }
      }
    }
  }

  /**
   * Walk every schema in the document and throw on an unsupported keyword.
   */
  function assertSupported() {
    let count = 0;
    const visit = (s, where) => {
      if (typeof s === "boolean" || s === undefined) return;
      checkKeywords(s, where);
      count += 1;
      if (s.$ref !== undefined) deref(s.$ref);
      if (s.pattern !== undefined) new RegExp(s.pattern, "u");
      for (const [k, sub] of Object.entries(s.properties ?? {}))
        visit(sub, `${where}.properties.${k}`);
      if (s.items !== undefined) visit(s.items, `${where}.items`);
      (s.prefixItems ?? []).forEach((sub, i) =>
        visit(sub, `${where}.prefixItems[${i}]`),
      );
      (s.anyOf ?? []).forEach((sub, i) => visit(sub, `${where}.anyOf[${i}]`));
      if (typeof s.additionalProperties === "object")
        visit(s.additionalProperties, `${where}.additionalProperties`);
    };
    for (const [name, s] of Object.entries(root.components?.schemas ?? {})) {
      visit(s, `#/components/schemas/${name}`);
    }
    for (const [p, ops] of Object.entries(root.paths ?? {})) {
      for (const [m, op] of Object.entries(ops)) {
        const where = `${m.toUpperCase()} ${p}`;
        for (const param of op.parameters ?? [])
          visit(param.schema, `${where} ${param.in}:${param.name}`);
        for (const [ct, c] of Object.entries(op.requestBody?.content ?? {})) {
          visit(c.schema, `${where} body ${ct}`);
        }
        for (const [code, r] of Object.entries(op.responses ?? {})) {
          for (const [ct, c] of Object.entries(r.content ?? {}))
            visit(c.schema, `${where} ${code} ${ct}`);
        }
      }
    }
    return count;
  }

  return { validate, schemaTypes, deref, assertSupported };
}

/** @param {unknown} a @param {unknown} b */
export function deepEqual(a, b) {
  if (a === b) return true;
  if (
    typeof a !== "object" ||
    typeof b !== "object" ||
    a === null ||
    b === null
  )
    return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => Object.hasOwn(b, k) && deepEqual(a[k], b[k]));
}
