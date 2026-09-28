/**
 * Code-fence info strings in the guide dialect:
 *
 *   ```bash id="register-agent" verify="live" title="Register the agent"
 *
 * Every fence carries a language from a short list, a kebab-case id (the
 * block's DOM id, so a step can be linked), a verify mode that says what the
 * sample needs to run, and a title shown as its caption. A `json` fence whose
 * id ends in `-response` is the expected response to the sample before it;
 * for those the verify mode is optional, since a response is not run.
 *
 * Anything else is a content error: a fence the page cannot caption or link
 * is a fence the reader cannot follow.
 */

export const FENCE_LANGS = [
  "bash",
  "json",
  "python",
  "js",
  "text",
  "env",
] as const;
export type FenceLang = (typeof FENCE_LANGS)[number];

export const VERIFY_MODES = ["live", "offline", "manual"] as const;
export type VerifyMode = (typeof VERIFY_MODES)[number];

export type FenceMeta = {
  lang: FenceLang;
  id: string;
  title: string;
  /** Null only on a response block that did not say. */
  verify: VerifyMode | null;
  /** A `json` block whose id ends in `-response`. */
  response: boolean;
};

export const KEBAB_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ATTR = /\s*([A-Za-z_][\w-]*)="([^"]*)"/y;
const KNOWN_ATTRS = new Set(["id", "verify", "title", "schema", "status"]);

/** Parse a fence's language and meta, or return the problems with it. */
export function parseFenceInfo(
  lang: string | null | undefined,
  meta: string | null | undefined,
): { ok: true; fence: FenceMeta } | { ok: false; problems: string[] } {
  const problems: string[] = [];
  const shown = `\`\`\`${[lang, meta].filter(Boolean).join(" ")}`;

  if (!lang) {
    return {
      ok: false,
      problems: [
        `a code fence has no info string; write \`\`\`<lang> id="…" verify="…" title="…" with lang one of ${FENCE_LANGS.join(", ")}`,
      ],
    };
  }
  if (!(FENCE_LANGS as readonly string[]).includes(lang)) {
    problems.push(
      `${shown}: language "${lang}" is not one of ${FENCE_LANGS.join(", ")}`,
    );
  }

  const attrs: Record<string, string> = {};
  const rest = meta ?? "";
  ATTR.lastIndex = 0;
  let consumed = 0;
  let m: RegExpExecArray | null;
  while ((m = ATTR.exec(rest))) {
    const [, key, value] = m;
    if (!KNOWN_ATTRS.has(key)) {
      problems.push(
        `${shown}: unknown attribute "${key}" (expected id, verify, title, schema, status)`,
      );
    } else if (key in attrs) {
      problems.push(`${shown}: attribute "${key}" is given twice`);
    }
    attrs[key] = value;
    consumed = ATTR.lastIndex;
  }
  if (rest.slice(consumed).trim()) {
    problems.push(
      `${shown}: could not read "${rest.slice(consumed).trim()}"; attributes are written key="value"`,
    );
  }

  const id = attrs.id;
  if (id === undefined) problems.push(`${shown}: missing id="…"`);
  else if (!KEBAB_ID.test(id)) {
    problems.push(`${shown}: id "${id}" is not kebab-case`);
  }

  const title = attrs.title?.trim();
  if (attrs.title === undefined) problems.push(`${shown}: missing title="…"`);
  else if (!title) problems.push(`${shown}: title is empty`);

  const response = lang === "json" && !!id && id.endsWith("-response");
  const verify = attrs.verify;
  if (verify === undefined) {
    if (!response) {
      problems.push(
        `${shown}: missing verify="…" (one of ${VERIFY_MODES.join(", ")})`,
      );
    }
  } else if (!(VERIFY_MODES as readonly string[]).includes(verify)) {
    problems.push(
      `${shown}: verify "${verify}" is not one of ${VERIFY_MODES.join(", ")}`,
    );
  }

  if (problems.length) return { ok: false, problems };
  return {
    ok: true,
    fence: {
      lang: lang as FenceLang,
      id: id!,
      title: title!,
      verify: (verify as VerifyMode | undefined) ?? null,
      response,
    },
  };
}
