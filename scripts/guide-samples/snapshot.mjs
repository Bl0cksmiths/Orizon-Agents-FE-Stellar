/**
 * The committed OpenAPI snapshot the guide is checked against.
 *
 * `content/guides/openapi.snapshot.json` is the backend's `app.openapi()` at a
 * known commit, with that commit recorded under the root `x-orizon-snapshot`
 * extension (so the file stays a valid OpenAPI document). The static check reads
 * this file, never the network: a check that fetches at run time turns a Render
 * cold start into a red build, and the deployment runs an older build than the
 * one the guide documents anyway.
 *
 * Drift is caught three ways:
 *   - the guide's `api_verified_against` must name the snapshot's backend sha,
 *     so re-verifying the guide and refreshing the snapshot move together;
 *   - every curl, body and documented response is checked against the
 *     snapshot's contract (contract.mjs);
 *   - `--diff-openapi <url|file>` compares the snapshot with a backend's
 *     current OpenAPI and fails on any difference, so a changed API is seen
 *     before the guide is wrong in front of a reader.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const SNAPSHOT_PATH = "content/guides/openapi.snapshot.json";
export const META_KEY = "x-orizon-snapshot";

/**
 * @typedef {{ backend_sha: string, backend_ref?: string, source?: string, generated_at?: string }} SnapshotMeta
 */

/** @param {string} path */
export function loadSnapshot(path) {
  if (!existsSync(path)) {
    throw new Error(
      `OpenAPI snapshot not found at ${path}. Generate it with --refresh-openapi <url|file> --backend-sha <sha>.`,
    );
  }
  const doc = JSON.parse(readFileSync(path, "utf8"));
  const meta = doc[META_KEY];
  if (
    meta === undefined ||
    typeof meta.backend_sha !== "string" ||
    !/^[0-9a-f]{40}$/.test(meta.backend_sha)
  ) {
    throw new Error(
      `${path} has no ${META_KEY}.backend_sha (a full 40-hex backend commit)`,
    );
  }
  if (typeof doc.openapi !== "string" || !doc.openapi.startsWith("3.1")) {
    throw new Error(
      `${path} is not an OpenAPI 3.1 document (openapi: ${doc.openapi})`,
    );
  }
  return { doc, meta: /** @type {SnapshotMeta} */ (meta) };
}

/**
 * The guide's `api_verified_against` against the snapshot's backend sha. A
 * short sha is accepted when it is a prefix of the full one.
 *
 * @param {string | undefined} guideSha
 * @param {string} snapshotSha
 * @returns {string | null}  a problem, or null when they agree
 */
export function checkShaDrift(guideSha, snapshotSha) {
  if (guideSha === undefined) return "the guide has no api_verified_against";
  if (guideSha.length >= 7 && snapshotSha.startsWith(guideSha.toLowerCase()))
    return null;
  return (
    `the guide says api_verified_against: ${guideSha}, but the OpenAPI snapshot is of backend ${snapshotSha}. ` +
    "Re-verify the guide against that backend and update api_verified_against, or refresh the snapshot " +
    "from the backend the guide was verified against."
  );
}

/** @param {string} source  an http(s) URL or a file path */
export async function readOpenApi(source) {
  if (/^https?:\/\//.test(source)) {
    const res = await fetch(source, {
      headers: { accept: "application/json" },
    });
    if (!res.ok) throw new Error(`${source} answered HTTP ${res.status}`);
    return /** @type {Record<string, any>} */ (await res.json());
  }
  return JSON.parse(readFileSync(source, "utf8"));
}

/** @param {Record<string, any>} doc */
function withoutMeta(doc) {
  const { [META_KEY]: _meta, ...rest } = doc;
  return rest;
}

/**
 * Rewrite the snapshot from `source`, recording `sha`.
 *
 * @param {{ source: string, sha: string, path: string, ref?: string, root: string }} options
 */
export async function refreshSnapshot({ source, sha, path, ref, root }) {
  if (!/^[0-9a-f]{40}$/.test(sha ?? "")) {
    throw new Error(
      "--refresh-openapi needs --backend-sha <full 40-hex commit of the backend that served it>",
    );
  }
  const doc = withoutMeta(await readOpenApi(source));
  if (typeof doc.openapi !== "string" || typeof doc.paths !== "object") {
    throw new Error(`${source} is not an OpenAPI document`);
  }
  /** @type {SnapshotMeta} */
  const meta = {
    backend_sha: sha,
    ...(ref ? { backend_ref: ref } : {}),
    source: /^https?:\/\//.test(source) ? source : "app.openapi() (file)",
    generated_at: new Date().toISOString().slice(0, 10),
  };
  writeFileSync(
    path,
    `${JSON.stringify({ [META_KEY]: meta, ...doc }, null, 2)}\n`,
  );
  // Keep `prettier --check .` green: format the file the way the repo does.
  const prettier = join(root, "node_modules", ".bin", "prettier");
  if (existsSync(prettier))
    spawnSync(prettier, ["--write", path], { stdio: "ignore" });
  return { meta, operations: countOperations(doc) };
}

/** @param {Record<string, any>} doc */
function countOperations(doc) {
  return Object.values(doc.paths ?? {}).reduce(
    (n, ops) => n + Object.keys(ops).length,
    0,
  );
}

/**
 * Every difference between the snapshot and a current OpenAPI document, by
 * operation and schema, ignoring the snapshot's own metadata.
 *
 * @param {Record<string, any>} snapshot
 * @param {Record<string, any>} current
 */
export function diffOpenApi(snapshot, current) {
  const a = withoutMeta(snapshot);
  const b = withoutMeta(current);
  /** @type {string[]} */
  const changes = [];
  const ops = (doc) => {
    const out = new Map();
    for (const [p, methods] of Object.entries(doc.paths ?? {})) {
      for (const [m, op] of Object.entries(methods))
        out.set(`${m.toUpperCase()} ${p}`, op);
    }
    return out;
  };
  const diffMaps = (label, left, right) => {
    for (const [key, value] of left) {
      if (!right.has(key)) changes.push(`${label} removed: ${key}`);
      else if (stable(value) !== stable(right.get(key)))
        changes.push(`${label} changed: ${key}`);
    }
    for (const key of right.keys())
      if (!left.has(key)) changes.push(`${label} added: ${key}`);
  };
  diffMaps("operation", ops(a), ops(b));
  diffMaps(
    "schema",
    new Map(Object.entries(a.components?.schemas ?? {})),
    new Map(Object.entries(b.components?.schemas ?? {})),
  );
  const rest = (doc) =>
    stable({
      ...doc,
      paths: undefined,
      components: { ...doc.components, schemas: undefined },
    });
  if (rest(a) !== rest(b))
    changes.push("document metadata changed (info, security schemes, ...)");
  return changes;
}

/** JSON with sorted keys, so key order is not a difference. */
function stable(value) {
  return JSON.stringify(value, (_, v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, v[k]]),
        )
      : v,
  );
}
