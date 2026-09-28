/**
 * Per-sample environment: which values each sample runs with.
 *
 * The guide's samples read the reader's own values (`$AGENT_ID`,
 * `$OPERATOR_PUBLIC_KEY`, ...), and one name can mean different things in
 * different steps: Step 3 needs an agent id nobody has registered, Step 5 on
 * needs one that is registered, with a funded owner. So the verifier takes
 * them from `content/guides/samples.env.json`:
 *
 *   {
 *     "default": { "AGENT_ID": "${ORIZON_AGENT_ID}", ... },
 *     "sets": { "registered": { "AGENT_ID": "uat624_ext_op", ... } },
 *     "samples": { "binding-read": "registered", "other": { "X": "1" } }
 *   }
 *
 * `default` applies to every sample; a sample named in `samples` gets that
 * set (or inline object) on top. A value may be literal, or `${NAME}` for a
 * generated fixture (fixtures.mjs: a fresh agent id, a throwaway keypair, ...),
 * so nothing secret is ever written into the file. A sample id that is not in
 * the guide is an error: a stale mapping would otherwise quietly stop applying.
 */
import { existsSync, readFileSync } from "node:fs";

export const SAMPLES_ENV_PATH = "content/guides/samples.env.json";

const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * @typedef {{
 *   default: Record<string, string>,
 *   sets: Record<string, Record<string, string>>,
 *   samples: Record<string, string | Record<string, string>>,
 * }} SamplesEnv
 */

/** @param {unknown} value @param {string} where */
function envObject(value, where) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${where} must be an object of NAME: "value"`);
  }
  for (const [k, v] of Object.entries(value)) {
    if (!NAME.test(k))
      throw new Error(
        `${where}: ${JSON.stringify(k)} is not an environment variable name`,
      );
    if (typeof v !== "string")
      throw new Error(`${where}.${k} must be a string`);
  }
  return /** @type {Record<string, string>} */ (value);
}

/**
 * @param {string} path
 * @returns {SamplesEnv | null}  null when the file does not exist
 */
export function loadSamplesEnv(path) {
  if (!existsSync(path)) return null;
  const raw = JSON.parse(readFileSync(path, "utf8"));
  const sets = {};
  for (const [name, set] of Object.entries(raw.sets ?? {}))
    sets[name] = envObject(set, `sets.${name}`);
  const samples = {};
  for (const [id, ref] of Object.entries(raw.samples ?? {})) {
    if (typeof ref === "string") {
      if (!Object.hasOwn(sets, ref))
        throw new Error(
          `samples.${id} names an unknown set ${JSON.stringify(ref)}`,
        );
      samples[id] = ref;
    } else {
      samples[id] = envObject(ref, `samples.${id}`);
    }
  }
  const known = new Set(["$comment", "default", "sets", "samples"]);
  for (const key of Object.keys(raw)) {
    if (!known.has(key)) throw new Error(`unknown key ${key} in ${path}`);
  }
  return { default: envObject(raw.default ?? {}, "default"), sets, samples };
}

/**
 * Sample ids the file names that the guide does not have.
 *
 * @param {SamplesEnv} env
 * @param {string[]} ids
 */
export function staleSampleIds(env, ids) {
  const have = new Set(ids);
  return Object.keys(env.samples).filter((id) => !have.has(id));
}

/**
 * The values for one sample, with `${NAME}` references filled from `fixtures`.
 * A value that references a name `fixtures` does not have is left out — that
 * is how a secret fixture stays out of a live run: the live caller passes only
 * the public fixtures.
 *
 * @param {SamplesEnv | null} env
 * @param {string} id
 * @param {Record<string, string>} fixtures
 * @param {Set<string>} [allNames]  every fixture name; a reference outside it is an error
 * @returns {Record<string, string>}
 */
export function envForSample(env, id, fixtures, allNames) {
  if (env === null) return {};
  const ref = env.samples[id];
  const layered = {
    ...env.default,
    ...(typeof ref === "string" ? env.sets[ref] : (ref ?? {})),
  };
  /** @type {Record<string, string>} */
  const out = {};
  for (const [name, value] of Object.entries(layered)) {
    let missing = false;
    const resolved = value.replace(
      /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g,
      (_, ref) => {
        if (allNames !== undefined && !allNames.has(ref)) {
          throw new Error(
            `${name} references \${${ref}}, which is not a fixture`,
          );
        }
        if (!Object.hasOwn(fixtures, ref)) {
          missing = true;
          return "";
        }
        return fixtures[ref];
      },
    );
    if (!missing) out[name] = resolved;
  }
  return out;
}
