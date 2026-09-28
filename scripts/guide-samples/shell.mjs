/**
 * Just enough POSIX shell to read a curl sample without running a shell.
 *
 * Live samples are executed by translating the curl into a fetch, never by
 * handing guide text to bash: the guide is prose anyone can edit, and a checker
 * that shells out to it runs whatever it says. So this reads the quoting rules a
 * reader's shell would apply (single quotes, double quotes, backslashes, line
 * continuations, `$VAR` / `${VAR}` / `$(...)` expansions) and nothing else.
 *
 * An expansion is kept as a marker, `\u0001NAME\u0002`, until `resolveWord`
 * fills it from an environment: the static check leaves unknown ones in place as
 * wildcards, the live run refuses them.
 */

export class ShellParseError extends Error {}

export const MARK_OPEN = "\u0001";
export const MARK_CLOSE = "\u0002";
const MARKER = /\u0001([^\u0002]*)\u0002/g;

/** @param {string} name */
export const marker = (name) => `${MARK_OPEN}${name}${MARK_CLOSE}`;

/** @param {string} word */
export const hasMarker = (word) => word.includes(MARK_OPEN);

/** @param {string} word */
export const isWholeMarker = (word) => /^\u0001[^\u0002]*\u0002$/.test(word);

/** The names of the expansions left in a word. */
export function markerNames(word) {
  return [...word.matchAll(MARKER)].map((match) => match[1]);
}

/** A readable form of a word, markers shown as `$NAME`. */
export function showWord(word) {
  return word.replace(MARKER, (_, name) =>
    name.startsWith("$(") ? name : `$${name}`,
  );
}

/**
 * @typedef {{ type: "word", value: string } | { type: "op", value: string }} Token
 * @typedef {{ words: string[], line: number }} Command
 * @typedef {{ commands: Command[], connector: string | null }} Pipeline
 */

/**
 * Split shell text into pipelines of commands of words.
 *
 * @param {string} src
 * @returns {{ pipelines: { commands: Command[] }[], connectors: string[] }}
 */
export function parseShell(src) {
  /** @type {{ commands: Command[] }[]} */
  const pipelines = [];
  /** @type {string[]} */
  const connectors = [];
  /** @type {Command[]} */
  let commands = [];
  /** @type {string[]} */
  let words = [];
  let line = 1;
  let commandLine = 1;
  let word = "";
  let inWord = false;
  let i = 0;

  const endWord = () => {
    if (inWord) {
      if (words.length === 0) commandLine = line;
      words.push(word);
    }
    word = "";
    inWord = false;
  };
  const endCommand = () => {
    endWord();
    if (words.length > 0) commands.push({ words, line: commandLine });
    words = [];
  };
  const endPipeline = (connector) => {
    endCommand();
    if (commands.length > 0) {
      pipelines.push({ commands });
      if (connector !== null) connectors.push(connector);
    }
    commands = [];
  };

  /** Reads `$...` at src[i] (which is "$"); returns the expansion text. */
  const readDollar = () => {
    const next = src[i + 1];
    if (next === "{") {
      const close = src.indexOf("}", i + 2);
      if (close === -1)
        throw new ShellParseError(`unterminated \${ on line ${line}`);
      const name = src.slice(i + 2, close);
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
        throw new ShellParseError(
          `unsupported parameter expansion \${${name}} on line ${line}`,
        );
      }
      i = close + 1;
      return marker(name);
    }
    if (next === "(") {
      let depth = 0;
      let j = i + 1;
      for (; j < src.length; j += 1) {
        if (src[j] === "(") depth += 1;
        else if (src[j] === ")") {
          depth -= 1;
          if (depth === 0) break;
        }
      }
      if (j >= src.length)
        throw new ShellParseError(`unterminated $( on line ${line}`);
      const text = src.slice(i, j + 1);
      line += (text.match(/\n/g) ?? []).length;
      i = j + 1;
      return marker(text);
    }
    if (next === "'") {
      throw new ShellParseError(
        `$'...' quoting is not supported (line ${line})`,
      );
    }
    const name = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i + 1));
    if (name === null) {
      i += 1;
      return "$";
    }
    i += 1 + name[0].length;
    return marker(name[0]);
  };

  while (i < src.length) {
    const ch = src[i];
    if (ch === "\\") {
      if (src[i + 1] === "\n") {
        line += 1;
        i += 2;
        continue;
      }
      if (i + 1 >= src.length) throw new ShellParseError("trailing backslash");
      word += src[i + 1];
      inWord = true;
      i += 2;
      continue;
    }
    if (ch === "'") {
      const close = src.indexOf("'", i + 1);
      if (close === -1)
        throw new ShellParseError(`unterminated ' on line ${line}`);
      const text = src.slice(i + 1, close);
      line += (text.match(/\n/g) ?? []).length;
      word += text;
      inWord = true;
      i = close + 1;
      continue;
    }
    if (ch === '"') {
      inWord = true;
      i += 1;
      for (;;) {
        if (i >= src.length)
          throw new ShellParseError(`unterminated " on line ${line}`);
        const c = src[i];
        if (c === '"') {
          i += 1;
          break;
        }
        if (c === "\\") {
          const n = src[i + 1];
          if (n === "\n") {
            line += 1;
            i += 2;
          } else if (n === "$" || n === "`" || n === '"' || n === "\\") {
            word += n;
            i += 2;
          } else {
            word += c;
            i += 1;
          }
          continue;
        }
        if (c === "$") {
          word += readDollar();
          continue;
        }
        if (c === "`")
          throw new ShellParseError(
            `backticks are not supported (line ${line})`,
          );
        if (c === "\n") line += 1;
        word += c;
        i += 1;
      }
      continue;
    }
    if (ch === "$") {
      word += readDollar();
      inWord = true;
      continue;
    }
    if (ch === "`")
      throw new ShellParseError(`backticks are not supported (line ${line})`);
    if (ch === "#" && !inWord) {
      while (i < src.length && src[i] !== "\n") i += 1;
      continue;
    }
    if (ch === "\n") {
      endPipeline("\n");
      line += 1;
      i += 1;
      continue;
    }
    if (ch === " " || ch === "\t" || ch === "\r") {
      endWord();
      i += 1;
      continue;
    }
    if (ch === "|" || ch === "&" || ch === ";") {
      const two = src.slice(i, i + 2);
      if (two === "&&" || two === "||") {
        endPipeline(two);
        i += 2;
        continue;
      }
      if (ch === "|") {
        endCommand();
        i += 1;
        continue;
      }
      if (ch === ";") {
        endPipeline(";");
        i += 1;
        continue;
      }
      throw new ShellParseError(`background & is not supported (line ${line})`);
    }
    if (ch === "<" || ch === ">") {
      throw new ShellParseError(
        `redirection ${ch} is not supported in an HTTP sample (line ${line})`,
      );
    }
    word += ch;
    inWord = true;
    i += 1;
  }
  endPipeline(null);
  return { pipelines, connectors };
}

/**
 * Fill expansion markers from `env`.
 *
 * @param {string} word
 * @param {Record<string, string | undefined>} env
 * @param {{ strict?: boolean }} [options]  strict: an unknown expansion throws
 */
export function resolveWord(word, env, { strict = false } = {}) {
  return word.replace(MARKER, (whole, name) => {
    if (name.startsWith("$(")) {
      if (strict)
        throw new ShellParseError(`command substitution ${name} cannot be run`);
      return whole;
    }
    const value = Object.hasOwn(env, name) ? env[name] : undefined;
    if (value === undefined) {
      if (strict) throw new ShellParseError(`$${name} is not set`);
      return whole;
    }
    return value;
  });
}

const ASSIGNMENT = /^([A-Za-z_][A-Za-z0-9_]*)=([\s\S]*)$/;

/**
 * `NAME=value` and `export NAME=value` commands, applied in order to `env`.
 * A value that still holds an unknown expansion unsets the name, so a later
 * use falls back to the fixture set (or stays a wildcard) instead of carrying
 * a half-expanded string.
 *
 * @param {Command} command
 * @param {Record<string, string>} env
 * @returns {boolean}  true when the command was assignments only
 */
export function applyAssignments(command, env) {
  const words =
    command.words[0] === "export" ? command.words.slice(1) : command.words;
  if (words.length === 0 || !words.every((w) => ASSIGNMENT.test(w)))
    return false;
  for (const w of words) {
    const [, name, raw] = /** @type {RegExpExecArray} */ (ASSIGNMENT.exec(w));
    const value = resolveWord(raw, env);
    if (hasMarker(value)) delete env[name];
    else env[name] = value;
  }
  return true;
}

/** The variables a reader's shell would hold after running these fences. */
export function sessionEnv(codes, base = {}) {
  /** @type {Record<string, string>} */
  const env = { ...base };
  for (const code of codes) {
    let parsed;
    try {
      parsed = parseShell(code);
    } catch {
      continue;
    }
    for (const pipeline of parsed.pipelines) {
      if (pipeline.commands.length === 1)
        applyAssignments(pipeline.commands[0], env);
    }
  }
  return env;
}

/** Options that take the next word as their value. */
const WITH_VALUE = {
  "-X": "method",
  "--request": "method",
  "-H": "header",
  "--header": "header",
  "-d": "data",
  "--data": "data",
  "--data-raw": "data",
  "--data-binary": "data",
  "--data-ascii": "data",
  "--data-urlencode": "urlencode",
  "--json": "json",
  "--url": "url",
  "-m": "ignore",
  "--max-time": "ignore",
  "--connect-timeout": "ignore",
  "--retry": "ignore",
};

/** Options with no value that do not change what is sent. */
const FLAGS = {
  "-s": "ignore",
  "--silent": "ignore",
  "-S": "ignore",
  "--show-error": "ignore",
  "-f": "ignore",
  "--fail": "ignore",
  "--fail-with-body": "ignore",
  "-L": "ignore",
  "--location": "ignore",
  "--compressed": "ignore",
  "-G": "get",
  "--get": "get",
};

/**
 * @typedef {{
 *   method: string, url: string, headers: [string, string][], body: string | null,
 *   line: number,
 * }} CurlRequest
 */

/**
 * The single curl command of an HTTP sample, as a request. Assignments before
 * it are allowed (and returned, so the caller can apply them); anything else is
 * not a copy-paste curl sample and is an error.
 *
 * @param {string} code
 * @returns {{ request: CurlRequest, assignments: Command[] }}
 */
export function parseCurlSample(code) {
  const { pipelines, connectors } = parseShell(code);
  const bad = connectors.find((c) => c === "&&" || c === "||");
  if (bad !== undefined) {
    throw new ShellParseError(
      `${bad} is not supported in an HTTP sample; one curl per sample`,
    );
  }
  /** @type {Command[]} */
  const assignments = [];
  /** @type {CurlRequest | null} */
  let request = null;
  for (const { commands } of pipelines) {
    const [first, ...piped] = commands;
    if (piped.length === 0 && applyAssignments(first, {})) {
      if (request !== null) {
        throw new ShellParseError(
          `line ${first.line}: assignments must come before the curl`,
        );
      }
      assignments.push(first);
      continue;
    }
    if (first.words[0] !== "curl") {
      throw new ShellParseError(
        `line ${first.line}: \`${showWord(first.words[0])}\` — an HTTP sample runs one curl and nothing else`,
      );
    }
    if (request !== null)
      throw new ShellParseError(
        `line ${first.line}: a second curl in one sample`,
      );
    for (const tail of piped) {
      const [cmd, ...args] = tail.words;
      const identity =
        cmd === "jq" &&
        (args.length === 0 || (args.length === 1 && args[0] === "."));
      if (!identity) {
        throw new ShellParseError(
          `line ${tail.line}: only \`| jq .\` may follow the curl, not \`${tail.words.map(showWord).join(" ")}\``,
        );
      }
    }
    request = parseCurl(first.words, first.line);
  }
  if (request === null) throw new ShellParseError("no curl command found");
  return { request, assignments };
}

/**
 * @param {string[]} words  words[0] is "curl"
 * @param {number} line
 * @returns {CurlRequest}
 */
export function parseCurl(words, line = 1) {
  /** @type {string | null} */
  let method = null;
  /** @type {[string, string][]} */
  const headers = [];
  /** @type {string[]} */
  const data = [];
  /** @type {string[]} */
  const encoded = [];
  let get = false;
  /** @type {string | null} */
  let url = null;

  const apply = (kind, value, option) => {
    switch (kind) {
      case "method":
        method = value.toUpperCase();
        break;
      case "header": {
        const colon = value.indexOf(":");
        if (colon <= 0)
          throw new ShellParseError(
            `${option} ${JSON.stringify(value)} is not Name: value`,
          );
        headers.push([
          value.slice(0, colon).trim(),
          value.slice(colon + 1).trim(),
        ]);
        break;
      }
      case "data":
        if (value.startsWith("@")) {
          throw new ShellParseError(
            `${option} ${value}: reading the body from a file is not copy-paste runnable`,
          );
        }
        data.push(value);
        break;
      case "json":
        data.push(value);
        headers.push(
          ["Content-Type", "application/json"],
          ["Accept", "application/json"],
        );
        break;
      case "urlencode":
        encoded.push(value);
        break;
      case "url":
        if (url !== null) throw new ShellParseError("more than one URL");
        url = value;
        break;
      default:
        break;
    }
  };

  for (let k = 1; k < words.length; k += 1) {
    const w = words[k];
    if (w.startsWith("--")) {
      const eq = w.indexOf("=");
      const name = eq === -1 ? w : w.slice(0, eq);
      if (name in WITH_VALUE) {
        const value = eq === -1 ? words[++k] : w.slice(eq + 1);
        if (value === undefined)
          throw new ShellParseError(`${name} needs a value`);
        apply(WITH_VALUE[name], value, name);
      } else if (name in FLAGS && eq === -1) {
        if (FLAGS[name] === "get") get = true;
      } else {
        throw new ShellParseError(`unsupported curl option ${name}`);
      }
      continue;
    }
    if (w.startsWith("-") && w.length > 1) {
      for (let c = 1; c < w.length; c += 1) {
        const opt = `-${w[c]}`;
        if (opt in WITH_VALUE) {
          const rest = w.slice(c + 1);
          const value = rest !== "" ? rest : words[++k];
          if (value === undefined)
            throw new ShellParseError(`${opt} needs a value`);
          apply(WITH_VALUE[opt], value, opt);
          break;
        }
        if (opt in FLAGS) {
          if (FLAGS[opt] === "get") get = true;
          continue;
        }
        throw new ShellParseError(`unsupported curl option ${opt}`);
      }
      continue;
    }
    apply("url", w, "url");
  }
  if (url === null) throw new ShellParseError("curl has no URL");

  const hasData = data.length > 0 || encoded.length > 0;
  let body = null;
  let finalUrl = /** @type {string} */ (url);
  if (get) {
    const parts = [...data, ...encoded.map(urlencodeArg)];
    if (parts.length > 0) {
      finalUrl += (finalUrl.includes("?") ? "&" : "?") + parts.join("&");
    }
  } else if (hasData) {
    body = [...data, ...encoded.map(urlencodeArg)].join("&");
  }
  const finalMethod = method ?? (hasData && !get ? "POST" : "GET");
  return { method: finalMethod, url: finalUrl, headers, body, line };
}

/** curl's --data-urlencode forms: `content`, `=content`, `name=content`. */
function urlencodeArg(arg) {
  const eq = arg.indexOf("=");
  if (eq === -1) return encodeURIComponent(arg);
  if (eq === 0) return encodeURIComponent(arg.slice(1));
  return `${arg.slice(0, eq)}=${encodeURIComponent(arg.slice(eq + 1))}`;
}

/**
 * Parse a JSON text that may hold expansion markers. A marker standing where a
 * JSON value goes (`"price": $PRICE`) becomes a string holding just the marker;
 * one inside a string stays in the string.
 *
 * @param {string} text
 */
export function parseJsonWithMarkers(text) {
  let out = "";
  let inString = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (ch === "\\") {
        out += ch + (text[i + 1] ?? "");
        i += 1;
        continue;
      }
      if (ch === '"') inString = false;
      if (ch === MARK_OPEN) out += "\\u0001";
      else if (ch === MARK_CLOSE) out += "\\u0002";
      else out += ch;
      continue;
    }
    if (ch === '"') {
      inString = true;
      out += ch;
      continue;
    }
    if (ch === MARK_OPEN) {
      const close = text.indexOf(MARK_CLOSE, i);
      out += JSON.stringify(text.slice(i, close + 1));
      i = close;
      continue;
    }
    out += ch;
  }
  return JSON.parse(out);
}
