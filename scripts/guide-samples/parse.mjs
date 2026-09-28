/**
 * The guide dialect: YAML frontmatter plus annotated code fences.
 *
 * `content/guides/list-your-agent.md` promises that every code sample in it is
 * copy-paste runnable and has been run. That promise is only checkable if every
 * fence says what it is, so the dialect is strict: every fence carries a
 * language and an id, every sample says how it is verified, and every documented
 * response or output is attached to the sample that produces it. A fence the
 * checker cannot place is an error, never an unverified extra.
 *
 *   ```bash id="get-network" verify="live" title="Read the network"
 *   curl -s "$ORIZON_API/stellar/network"
 *   ```
 *   ```json id="get-network-response"
 *   { "network": "testnet", "expires_at": "<unix seconds>" }
 *   ```
 *
 * `status="<code>"` on a `-response` fence documents a non-200 answer; without
 * it the documented response is the operation's 200. A `-response` or
 * `-output` fence may repeat its sample's `verify=` (it must then agree).
 *
 * An HTTP sample is a curl against `$ORIZON_API`. A curl to any other host (a
 * faucet, the reader's own agent) is an EXTERNAL curl: it is outside the API
 * contract, needs no response fence, and can only be `verify="manual"`.
 *
 * A `json` sample may name a contract schema, `schema="AgentIdAvailability"`,
 * to be validated against `#/components/schemas/AgentIdAvailability`. A json
 * sample has nothing to execute, so `verify="offline"` on one means the same
 * static check as `manual`.
 */

export const GUIDE_PATH = "content/guides/list-your-agent.md";

export const LANGS = new Set(["bash", "json", "python", "js", "text", "env"]);
export const MODES = new Set(["live", "offline", "manual"]);

/** Which languages each verify mode can apply to. */
const MODE_LANGS = {
  live: new Set(["bash"]),
  offline: new Set(["bash", "python", "js", "json"]),
  manual: LANGS,
};

export const FRONTMATTER_KEYS = [
  "title",
  "description",
  "version",
  "api_verified_against",
  "network",
  "updated",
  "status",
];

const FRONTMATTER_RULES = {
  title: [/\S/, "a non-empty title"],
  description: [/\S/, "a non-empty description"],
  version: [/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/, "a semver such as 1.0.0"],
  api_verified_against: [/^[0-9a-f]{7,40}$/, "a backend git sha (7-40 hex)"],
  network: [/^testnet$/, '"testnet" — the guide is testnet only'],
  updated: [/^\d{4}-\d{2}-\d{2}$/, "a date as YYYY-MM-DD"],
  status: [/^[a-z][a-z-]*$/, "a lowercase word such as draft or published"],
};

const FENCE_ATTRS = new Set(["id", "verify", "title", "status", "schema"]);
const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const RESPONSE_SUFFIX = "-response";
export const OUTPUT_SUFFIX = "-output";

/**
 * @typedef {{ line: number, message: string, id?: string }} ParseError
 * @typedef {{
 *   id: string, lang: string, verify: string | undefined, title: string | undefined,
 *   attrs: Record<string, string>, code: string, line: number, index: number,
 *   kind: "sample" | "response" | "output", curl: boolean, http: boolean, external: boolean,
 *   response?: Fence, output?: Fence, attachedTo?: string,
 * }} Fence
 */

/**
 * A flat `key: value` YAML subset. Anything richer (nesting, lists, anchors) is
 * an error rather than a guess: the frontmatter is seven scalars.
 *
 * @param {string} text  the whole guide
 */
export function parseFrontmatter(text) {
  /** @type {ParseError[]} */
  const errors = [];
  /** @type {Record<string, string>} */
  const data = {};
  const lines = text.split("\n");
  if (lines[0]?.trim() !== "---") {
    errors.push({
      line: 1,
      message: "the guide must open with --- frontmatter",
    });
    return { data, bodyStart: 0, errors };
  }
  let end = -1;
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i].trim() === "---") {
      end = i;
      break;
    }
    const line = lines[i];
    if (line.trim() === "" || line.trim().startsWith("#")) continue;
    const match = /^([A-Za-z_][A-Za-z0-9_]*):(?:\s+(.*))?$/.exec(line);
    if (match === null) {
      errors.push({
        line: i + 1,
        message: `unsupported frontmatter line ${JSON.stringify(line)}: the frontmatter is flat key: value`,
      });
      continue;
    }
    const [, key, raw = ""] = match;
    const value = unquoteYaml(raw.trim());
    if (value === null) {
      errors.push({ line: i + 1, message: `unterminated quote in ${key}` });
      continue;
    }
    if (key in data) {
      errors.push({ line: i + 1, message: `duplicate frontmatter key ${key}` });
    }
    data[key] = value;
  }
  if (end === -1) {
    errors.push({
      line: 1,
      message: "the frontmatter is never closed with ---",
    });
    return { data, bodyStart: lines.length, errors };
  }
  for (const key of Object.keys(data)) {
    if (!FRONTMATTER_KEYS.includes(key)) {
      errors.push({ line: 1, message: `unknown frontmatter key ${key}` });
    }
  }
  for (const key of FRONTMATTER_KEYS) {
    if (!(key in data)) {
      errors.push({ line: 1, message: `frontmatter is missing ${key}` });
      continue;
    }
    const [rule, what] = FRONTMATTER_RULES[key];
    if (!rule.test(data[key])) {
      errors.push({
        line: 1,
        message: `frontmatter ${key} is ${JSON.stringify(data[key])}; expected ${what}`,
      });
    }
  }
  if (
    "updated" in data &&
    FRONTMATTER_RULES.updated[0].test(data.updated) &&
    Number.isNaN(Date.parse(`${data.updated}T00:00:00Z`))
  ) {
    errors.push({ line: 1, message: `frontmatter updated is not a real date` });
  }
  return { data, bodyStart: end + 1, errors };
}

/** @param {string} raw */
function unquoteYaml(raw) {
  if (raw.startsWith('"')) {
    if (!raw.endsWith('"') || raw.length < 2) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (raw.startsWith("'")) {
    if (!raw.endsWith("'") || raw.length < 2) return null;
    return raw.slice(1, -1).replaceAll("''", "'");
  }
  // A trailing ` # comment` is YAML; a `#` inside a word is not.
  return raw.replace(/\s+#.*$/, "");
}

/**
 * `lang key="value" key=value`. Returns null for attrs it cannot read.
 *
 * @param {string} info
 */
export function parseInfoString(info) {
  const trimmed = info.trim();
  const langMatch = /^(\S*)/.exec(trimmed);
  const lang = langMatch ? langMatch[1] : "";
  let rest = trimmed.slice(lang.length);
  /** @type {Record<string, string>} */
  const attrs = {};
  const problems = [];
  const ATTR = /^\s+([A-Za-z_][\w-]*)=(?:"((?:[^"\\]|\\.)*)"|([^\s"]+))/;
  while (rest.trim() !== "") {
    const match = ATTR.exec(rest);
    if (match === null) {
      problems.push(
        `cannot read fence attributes at ${JSON.stringify(rest.trim())}`,
      );
      break;
    }
    const [whole, key, quoted, bare] = match;
    if (key in attrs) problems.push(`duplicate fence attribute ${key}`);
    attrs[key] = quoted !== undefined ? quoted.replace(/\\(.)/g, "$1") : bare;
    rest = rest.slice(whole.length);
  }
  return { lang, attrs, problems };
}

/** A bash fence that runs curl: an HTTP sample. Comments do not count. */
export function isHttpCode(code) {
  return code
    .split("\n")
    .some((line) =>
      /(^|[\s;|&(])curl(\s|$)/.test(line.replace(/(^|\s)#.*$/, "")),
    );
}

/**
 * Every fenced block with its absolute line number.
 *
 * @param {string[]} lines
 * @param {number} start  first body line (0-based)
 */
function scanFences(lines, start) {
  const fences = [];
  /** @type {ParseError[]} */
  const errors = [];
  let i = start;
  while (i < lines.length) {
    const open = /^(\s*)(`{3,}|~{3,})(.*)$/.exec(lines[i]);
    if (open === null) {
      i += 1;
      continue;
    }
    const [, indent, marker, info] = open;
    if (marker[0] === "`" && info.includes("`")) {
      i += 1;
      continue;
    }
    const closeRe = new RegExp(
      `^\\s*${marker[0] === "`" ? "`" : "~"}{${marker.length},}\\s*$`,
    );
    let j = i + 1;
    while (j < lines.length && !closeRe.test(lines[j])) j += 1;
    if (j >= lines.length) {
      errors.push({ line: i + 1, message: "code fence is never closed" });
      break;
    }
    const body = lines
      .slice(i + 1, j)
      .map((line) =>
        line.startsWith(indent) ? line.slice(indent.length) : line.trimStart(),
      );
    fences.push({ info, code: body.join("\n"), line: i + 1 });
    i = j + 1;
  }
  return { fences, errors };
}

const API_DEFINITION = /^\s*(?:export\s+)?ORIZON_API=(\S+)\s*(?:#.*)?$/;
const API_USE = /\$(?:\{ORIZON_API\}|ORIZON_API(?![A-Za-z0-9_]))/;

/**
 * Parse and structurally validate a guide.
 *
 * @param {string} text
 */
export function parseGuide(text) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const front = parseFrontmatter(lines.join("\n"));
  /** @type {ParseError[]} */
  const errors = [...front.errors];
  const scanned = scanFences(lines, front.bodyStart);
  errors.push(...scanned.errors);

  /** @type {Fence[]} */
  const fences = [];
  const byId = new Map();
  scanned.fences.forEach((raw, index) => {
    const { lang, attrs, problems } = parseInfoString(raw.info);
    for (const message of problems) errors.push({ line: raw.line, message });
    const id = attrs.id;
    const where = { line: raw.line, id };
    if (lang === "") {
      errors.push({ ...where, message: "code fence has no language" });
    } else if (!LANGS.has(lang)) {
      errors.push({
        ...where,
        message: `language ${JSON.stringify(lang)} is not one of ${[...LANGS].join(", ")}`,
      });
    }
    for (const key of Object.keys(attrs)) {
      if (!FENCE_ATTRS.has(key)) {
        errors.push({ ...where, message: `unknown fence attribute ${key}` });
      }
    }
    if (id === undefined) {
      errors.push({ ...where, message: "code fence has no id" });
      return;
    }
    if (!KEBAB.test(id)) {
      errors.push({
        ...where,
        message: `id ${JSON.stringify(id)} is not kebab-case`,
      });
    }
    if (byId.has(id)) {
      errors.push({
        ...where,
        message: `duplicate id ${id} (first used at line ${byId.get(id).line})`,
      });
      return;
    }
    const kind = id.endsWith(RESPONSE_SUFFIX)
      ? "response"
      : id.endsWith(OUTPUT_SUFFIX)
        ? "output"
        : "sample";
    /** @type {Fence} */
    const fence = {
      id,
      lang,
      verify: attrs.verify,
      title: attrs.title,
      attrs,
      code: raw.code,
      line: raw.line,
      index,
      kind,
      curl: lang === "bash" && isHttpCode(raw.code),
      http: false,
      external: false,
    };
    // A curl against $ORIZON_API is an HTTP sample; any other curl is external.
    fence.http = fence.curl && API_USE.test(raw.code);
    fence.external = fence.curl && !fence.http;
    byId.set(id, fence);
    fences.push(fence);
  });

  const samples = fences.filter((fence) => fence.kind === "sample");

  for (const fence of samples) {
    const where = { line: fence.line, id: fence.id };
    if ("status" in fence.attrs) {
      errors.push({
        ...where,
        message: "status= belongs on the -response fence",
      });
    }
    if (fence.verify === undefined) {
      errors.push({
        ...where,
        message: 'sample has no verify="live|offline|manual"',
      });
      continue;
    }
    if (!MODES.has(fence.verify)) {
      errors.push({
        ...where,
        message: `verify=${JSON.stringify(fence.verify)} is not one of live, offline, manual`,
      });
      continue;
    }
    if (!MODE_LANGS[fence.verify].has(fence.lang)) {
      errors.push({
        ...where,
        message: `verify="${fence.verify}" cannot apply to a ${fence.lang} fence`,
      });
    }
    if (fence.verify === "live" && !fence.http) {
      errors.push({
        ...where,
        message: 'verify="live" is only for curl samples',
      });
    }
    if (fence.external && fence.verify !== "manual") {
      errors.push({
        ...where,
        message:
          'a curl that is not against $ORIZON_API is outside the contract and can only be verify="manual"',
      });
    }
    if ("schema" in fence.attrs && fence.lang !== "json") {
      errors.push({
        ...where,
        message: "schema= only applies to a json sample",
      });
    }
    if (fence.verify === "offline" && fence.http) {
      errors.push({
        ...where,
        message:
          'an HTTP sample cannot be verify="offline": the sandbox has no network',
      });
    }
  }

  // Attachments: each -response / -output fence belongs to the sample whose id
  // it extends, and is the very next fence after it.
  for (const fence of fences) {
    if (fence.kind === "sample") continue;
    const suffix = fence.kind === "response" ? RESPONSE_SUFFIX : OUTPUT_SUFFIX;
    const baseId = fence.id.slice(0, -suffix.length);
    const where = { line: fence.line, id: fence.id };
    const base = byId.get(baseId);
    if ("schema" in fence.attrs) {
      errors.push({
        ...where,
        message: `schema= does not apply to a ${suffix} fence`,
      });
    }
    if (fence.kind === "output" && "status" in fence.attrs) {
      errors.push({
        ...where,
        message: "status= only applies to a -response fence",
      });
    }
    if (base === undefined || base.kind !== "sample") {
      errors.push({
        ...where,
        message: `${fence.id} is attached to no sample ${baseId}`,
      });
      continue;
    }
    if (fence.index !== base.index + 1) {
      errors.push({
        ...where,
        message: `${fence.id} must be the next code fence after ${baseId} (line ${base.line})`,
      });
    }
    fence.attachedTo = baseId;
    if ("verify" in fence.attrs && fence.attrs.verify !== base.verify) {
      errors.push({
        ...where,
        message: `${fence.id} says verify="${fence.attrs.verify}" but its sample ${baseId} is verify="${base.verify}"`,
      });
    }
    if (fence.kind === "response") {
      if (fence.lang !== "json")
        errors.push({ ...where, message: "a -response fence must be json" });
      if (!base.curl) {
        errors.push({
          ...where,
          message: `${baseId} is not a curl sample; it has no response`,
        });
      }
      if ("status" in fence.attrs && !/^[1-5]\d\d$/.test(fence.attrs.status)) {
        errors.push({
          ...where,
          message: `status=${fence.attrs.status} is not an HTTP status`,
        });
      }
      base.response = fence;
    } else {
      if (fence.lang !== "text")
        errors.push({ ...where, message: "an -output fence must be text" });
      if (base.curl) {
        errors.push({
          ...where,
          message: `${baseId} is a curl sample; document it with -response`,
        });
      }
      base.output = fence;
    }
  }

  for (const fence of samples) {
    if (fence.http && fence.response === undefined) {
      errors.push({
        line: fence.line,
        id: fence.id,
        message: `HTTP sample ${fence.id} has no ${fence.id}${RESPONSE_SUFFIX} fence`,
      });
    }
  }

  for (const fence of fences) {
    if (fence.lang !== "json" || fence.kind === "output") continue;
    try {
      JSON.parse(fence.code);
    } catch (err) {
      errors.push({
        line: fence.line,
        id: fence.id,
        message: `invalid JSON: ${err instanceof Error ? err.message : err}`,
      });
    }
  }

  // $ORIZON_API: set once, by an `export ORIZON_API=...` in a bash fence, before
  // any fence uses it.
  /** @type {string | undefined} */
  let apiBase;
  let apiLine = 0;
  for (const fence of fences) {
    const lines = fence.code.split("\n");
    for (let k = 0; k < lines.length; k += 1) {
      const text = lines[k];
      const definition =
        fence.lang === "bash" ? API_DEFINITION.exec(text) : null;
      if (definition !== null) {
        const value = definition[1].replace(/^(["'])(.*)\1$/, "$2");
        if (!/^https?:\/\/[^\s/]+(\/\S*)?$/.test(value)) {
          errors.push({
            line: fence.line + 1 + k,
            id: fence.id,
            message: `ORIZON_API=${value} is not an http(s) URL`,
          });
        } else if (apiBase !== undefined && apiBase !== value) {
          errors.push({
            line: fence.line + 1 + k,
            id: fence.id,
            message: `ORIZON_API is redefined as ${value} (was ${apiBase} at line ${apiLine})`,
          });
        } else if (apiBase === undefined) {
          apiBase = value;
          apiLine = fence.line + 1 + k;
        }
        continue;
      }
      if (API_USE.test(text) && apiBase === undefined) {
        errors.push({
          line: fence.line + 1 + k,
          id: fence.id,
          message: "$ORIZON_API is used before any `export ORIZON_API=...`",
        });
      }
    }
  }

  return { frontmatter: front.data, fences, samples, apiBase, errors };
}
