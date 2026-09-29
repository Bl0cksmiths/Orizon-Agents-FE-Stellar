/**
 * The static contract check: every curl in the guide against the backend's
 * OpenAPI snapshot, with no network.
 *
 * For each HTTP sample:
 *   - its method and path exist (path parameters matched as templates, so
 *     `$ORIZON_API/agents/my_agent/readiness` is `GET /api/agents/{agent_id}/readiness`);
 *   - its query names and non-standard headers (X-API-Key, X-Task-Token, ...)
 *     are declared by that operation, and none it requires is left out;
 *   - a JSON body is sent as JSON and validates against the request schema;
 *   - its documented response validates against the response schema for the
 *     documented status, which also fixes the type of every untagged wildcard.
 *
 * Shell variables the guide never sets (`$AGENT_ID` in a URL, `$SIGNATURE` in a
 * body) are wildcards here: they match any path parameter and any value of the
 * declared type. The live run fills them or refuses.
 */
import { docWildcards } from "./schema.mjs";
import {
  hasMarker,
  isWholeMarker,
  markerNames,
  parseCurlSample,
  parseJsonWithMarkers,
  resolveWord,
  showWord,
} from "./shell.mjs";

/** Headers every HTTP client sends; they are not part of an operation. */
const STANDARD_HEADERS = new Set([
  "content-type",
  "accept",
  "user-agent",
  "accept-encoding",
  "content-length",
]);

/** Request-side wildcards: shell expansions left in a JSON body or parameter. */
export const shellWildcards = (value) => {
  if (typeof value !== "string" || !hasMarker(value)) return null;
  const label = showWord(value);
  return isWholeMarker(value)
    ? { types: new Set(["any"]), label }
    : { types: new Set(["string"]), label };
};

/**
 * @param {Record<string, any>} doc
 * @param {string} method
 * @param {string} path  may hold expansion markers
 */
export function findOperation(doc, method, path) {
  const want = path.split("/");
  let best = null;
  /** @type {string[]} */
  const otherMethods = [];
  for (const [template, ops] of Object.entries(doc.paths ?? {})) {
    const parts = template.split("/");
    if (parts.length !== want.length) continue;
    /** @type {Record<string, string>} */
    const params = {};
    let literal = 0;
    let ok = true;
    for (let i = 0; i < parts.length; i += 1) {
      const param = /^\{([^}]+)\}$/.exec(parts[i]);
      if (param !== null) {
        if (want[i] === "") {
          ok = false;
          break;
        }
        params[param[1]] = want[i];
      } else if (parts[i] === want[i]) {
        literal += 1;
      } else {
        ok = false;
        break;
      }
    }
    if (!ok) continue;
    const op = ops[method.toLowerCase()];
    if (op === undefined) {
      otherMethods.push(
        ...Object.keys(ops).map((m) => `${m.toUpperCase()} ${template}`),
      );
      continue;
    }
    if (best === null || literal > best.literal)
      best = { template, op, params, literal };
  }
  if (best === null) {
    const also =
      otherMethods.length > 0
        ? ` (the contract has ${otherMethods.join(", ")})`
        : "";
    return {
      error: `${method} ${showWord(path)} is not an operation in the OpenAPI snapshot${also}`,
    };
  }
  return best;
}

/** Coerce a path or query string to the type its schema declares. */
function coerce(value, types) {
  if (types === null || types.has("string")) return value;
  if (
    (types.has("integer") || types.has("number")) &&
    /^-?\d+(\.\d+)?$/.test(value)
  )
    return Number(value);
  if (types.has("boolean") && (value === "true" || value === "false"))
    return value === "true";
  return value;
}

/**
 * @param {string} query
 * @returns {[string, string][]}
 */
function parseQuery(query) {
  if (query === "") return [];
  return query.split("&").map((pair) => {
    const eq = pair.indexOf("=");
    const name = eq === -1 ? pair : pair.slice(0, eq);
    const value = eq === -1 ? "" : pair.slice(eq + 1);
    const decode = (s) => {
      try {
        return decodeURIComponent(s.replace(/\+/g, " "));
      } catch {
        return s;
      }
    };
    return [decode(name), decode(value)];
  });
}

/**
 * @typedef {{
 *   ok: boolean, problems: string[], operation?: string, status: string,
 *   request?: import("./shell.mjs").CurlRequest, wildcards: Map<string, Set<string>>,
 * }} ContractResult
 */

/**
 * @param {{
 *   sample: import("./parse.mjs").Fence,
 *   doc: Record<string, any>,
 *   validator: ReturnType<typeof import("./schema.mjs").createValidator>,
 *   env: Record<string, string>,
 *   apiBase: string | undefined,
 * }} input
 * @returns {ContractResult}
 */
export function checkHttpSample({ sample, doc, validator, env, apiBase }) {
  /** @type {string[]} */
  const problems = [];
  const status = sample.response?.attrs.status ?? "200";
  /** @type {Map<string, Set<string>>} */
  let wildcards = new Map();
  const done = (extra = {}) => ({
    ok: problems.length === 0,
    problems,
    status,
    wildcards,
    ...extra,
  });

  let parsed;
  try {
    parsed = parseCurlSample(sample.code);
  } catch (err) {
    problems.push(
      `the curl does not parse: ${err instanceof Error ? err.message : err}`,
    );
    return done();
  }
  const { request } = parsed;
  const url = resolveWord(request.url, env);
  if (apiBase === undefined || !url.startsWith(apiBase)) {
    problems.push(`the URL ${showWord(url)} is not under $ORIZON_API`);
    return done({ request });
  }
  const origin = /^https?:\/\/[^/]+/.exec(apiBase)?.[0] ?? "";
  const rest = url.slice(origin.length);
  const q = rest.indexOf("?");
  const path = q === -1 ? rest : rest.slice(0, q);
  const query = q === -1 ? "" : rest.slice(q + 1);

  const found = findOperation(doc, request.method, path);
  if ("error" in found) {
    problems.push(found.error);
    return done({ request });
  }
  const { op, template, params } = found;
  const operation = `${request.method} ${template}`;
  const declared = (op.parameters ?? []).map((p) =>
    "$ref" in p ? validator.deref(p.$ref) : p,
  );

  const checkParam = (param, raw, where) => {
    if (hasMarker(raw)) return;
    let value = raw;
    try {
      value = decodeURIComponent(raw);
    } catch {
      // keep raw
    }
    const typed = coerce(value, validator.schemaTypes(param.schema));
    const { errors } = validator.validate(param.schema, typed);
    for (const e of errors)
      problems.push(
        `${where} ${param.name}=${JSON.stringify(value)}: ${e.message}`,
      );
  };

  for (const [name, raw] of Object.entries(params)) {
    const param = declared.find((p) => p.in === "path" && p.name === name);
    if (param !== undefined) checkParam(param, raw, "path parameter");
  }

  const queryPairs = parseQuery(query);
  for (const [name, value] of queryPairs) {
    const param = declared.find((p) => p.in === "query" && p.name === name);
    if (param === undefined) {
      problems.push(`query parameter ${name} is not declared by ${operation}`);
    } else {
      checkParam(param, value, "query parameter");
    }
  }
  for (const p of declared.filter((d) => d.in === "query" && d.required)) {
    if (!queryPairs.some(([name]) => name === p.name)) {
      problems.push(`${operation} requires query parameter ${p.name}`);
    }
  }

  const securityHeaders = new Set();
  const schemes = doc.components?.securitySchemes ?? {};
  for (const requirement of op.security ?? doc.security ?? []) {
    for (const name of Object.keys(requirement)) {
      const scheme = schemes[name];
      if (scheme?.type === "apiKey" && scheme.in === "header")
        securityHeaders.add(scheme.name.toLowerCase());
    }
  }
  const sent = new Set(request.headers.map(([name]) => name.toLowerCase()));
  for (const [name] of request.headers) {
    const lower = name.toLowerCase();
    if (STANDARD_HEADERS.has(lower)) continue;
    const known =
      securityHeaders.has(lower) ||
      declared.some((p) => p.in === "header" && p.name.toLowerCase() === lower);
    if (!known) problems.push(`header ${name} is not declared by ${operation}`);
  }
  for (const p of declared.filter((d) => d.in === "header" && d.required)) {
    if (!sent.has(p.name.toLowerCase()))
      problems.push(`${operation} requires header ${p.name}`);
  }

  const bodySpec = op.requestBody;
  if (request.body !== null) {
    const jsonSchema = bodySpec?.content?.["application/json"]?.schema;
    if (bodySpec === undefined) {
      problems.push(
        `${operation} takes no request body, but the curl sends one`,
      );
    } else if (jsonSchema === undefined) {
      problems.push(
        `${operation} does not take a JSON body (${Object.keys(bodySpec.content ?? {}).join(", ")})`,
      );
    } else {
      const contentType = request.headers.find(
        ([name]) => name.toLowerCase() === "content-type",
      )?.[1];
      if (
        contentType === undefined ||
        !contentType.toLowerCase().startsWith("application/json")
      ) {
        problems.push(
          `the body is sent as ${contentType ?? "application/x-www-form-urlencoded (curl's default for -d)"}; ` +
            `add -H "Content-Type: application/json"`,
        );
      }
      let body;
      try {
        body = parseJsonWithMarkers(resolveWord(request.body, env));
      } catch (err) {
        problems.push(
          `the request body is not valid JSON: ${err instanceof Error ? err.message : err}`,
        );
      }
      if (body !== undefined) {
        const { errors } = validator.validate(jsonSchema, body, {
          wildcard: shellWildcards,
          path: "body",
        });
        for (const e of errors)
          problems.push(`request ${e.path}: ${e.message}`);
      }
    }
  } else if (bodySpec?.required) {
    problems.push(`${operation} requires a request body`);
  }

  if (sample.response !== undefined) {
    const response = op.responses?.[status];
    if (response === undefined) {
      problems.push(
        `${operation} documents no ${status} response (it has ${Object.keys(op.responses ?? {}).join(", ")})`,
      );
    } else {
      const schema = response.content?.["application/json"]?.schema;
      let documented;
      try {
        documented = JSON.parse(sample.response.code);
      } catch {
        // parse.mjs reports invalid JSON
      }
      if (schema === undefined) {
        problems.push(`${operation} ${status} has no JSON response schema`);
      } else if (documented !== undefined) {
        const result = validator.validate(schema, documented, {
          wildcard: docWildcards,
        });
        wildcards = result.wildcards;
        for (const e of result.errors)
          problems.push(`documented response ${e.path}: ${e.message}`);
      }
    }
  }

  const unknownVars = new Set([
    ...markerNames(request.url),
    ...(request.body === null ? [] : markerNames(request.body)),
    ...request.headers.flatMap(([, v]) => markerNames(v)),
  ]);
  return done({
    request,
    operation,
    unresolved: [...unknownVars].filter((n) => !(n in env)),
  });
}
