/**
 * The evidence index's rules: content/evidence/index.json, checked at build.
 *
 * This lives in `.mjs` (not `.ts`) so a plain Node script (the link verifier,
 * scripts/evidence-check.mjs) runs the very same checks that `next build`
 * runs through lib/evidence/load.ts. There is one rule book, not two.
 *
 * The page exists so a non-technical reviewer can tick the SOW §6.2 checklist
 * by clicking links, so the rules are about honesty and legibility:
 *
 *   - it mirrors the SOW exactly: D1, D2, D3, D4 and RD in that order, each
 *     with its §6.1 Evidence Type and Description verbatim, and the eleven
 *     §6.3 metrics m01…m11 in order with their category, metric and target
 *     verbatim (lib/evidence/sow.mjs);
 *   - a metric leaves the table only in the open: when one is removed from
 *     the sprint's requirements, `removed_metrics` gives it exactly one entry
 *     with its id, its SOW metric text verbatim, the calendar date it was
 *     removed and a note in plain words. Every §6.3 id is then either a row
 *     or an entry, never both and never neither, so the table cannot shrink
 *     silently and a removed metric cannot linger as a row;
 *   - nothing is claimed without proof: a "present" item and a "met" metric
 *     each carry at least one link, and a "partial" or "missing" item or a
 *     "not_met" metric says why, in words;
 *   - every link reads as words, never a bare hash or address, and goes where
 *     it says: https only, a transaction link is exactly the testnet Stellar
 *     Expert page for its own hash, a contract or account link is the testnet
 *     page for a real-shaped id, and no mainnet explorer URL appears anywhere;
 *   - the four disclosures the story requires are all there.
 *
 * Every problem is collected, never just the first, so a failed build lists
 * everything that needs fixing at once. Unknown keys are problems too: the
 * contract is frozen, and a misspelt key would otherwise be silently ignored.
 */

import { SOW_6_1, SOW_6_3, SOW_VERSION } from "./sow.mjs";

export const SCHEMA = "orizon.evidence-index/1";
export const DELIVERABLE_IDS = ["D1", "D2", "D3", "D4", "RD"];
export const METRIC_IDS = SOW_6_3.map((m) => m.id);
export const ITEM_STATUSES = ["present", "partial", "missing"];
export const METRIC_STATUSES = ["met", "not_met"];
export const LINK_KINDS = [
  "tx",
  "contract",
  "account",
  "page",
  "pr",
  "repo",
  "video",
  "doc",
];
export const REQUIRED_DISCLOSURES = [
  "testnet",
  "platform_credits",
  "offchain_binding",
  "single_settler_key",
];

export const TX_HASH = /^[0-9a-f]{64}$/;
const CONTRACT_ID = /^C[A-Z2-7]{55}$/;
const ACCOUNT_ID = /^G[A-Z2-7]{55}$/;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export const EXPLORER = "https://stellar.expert/explorer/testnet";

/** The one URL a `tx` link may carry for `hash`. */
export function testnetTxUrl(hash) {
  return `${EXPLORER}/tx/${hash}`;
}

const TOP_KEYS = [
  "schema",
  "title",
  "sow",
  "snapshot",
  "deliverables",
  "metrics",
  "disclosures",
  "notes",
  "removed_metrics",
];
const SOW_KEYS = ["version", "date", "note"];
const SNAPSHOT_KEYS = ["as_of", "network", "method"];
const DELIVERABLE_KEYS = ["id", "name", "evidence_type", "sow_text", "items"];
const ITEM_KEYS = ["id", "claim", "status", "note", "links"];
const LINK_KEYS = ["label", "url", "kind", "tx_hash", "date"];
const METRIC_KEYS = [
  "id",
  "category",
  "metric",
  "target",
  "achieved",
  "status",
  "reason",
  "method",
  "links",
];
const REMOVED_METRIC_KEYS = ["id", "metric", "removed_on", "note"];
const DISCLOSURE_KEYS = ["id", "title", "text", "sow_ref", "changed_since_sow"];
const NOTE_KEYS = ["id", "title", "text"];

function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function show(value) {
  if (value === undefined) return "missing";
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return "an array";
  if (typeof value === "object") return "an object";
  return `${String(value)} (${typeof value})`;
}

function nonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function unknownKeys(where, value, allowed, problems) {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) {
      problems.push(
        `${where} has an unknown key "${key}"; allowed: ${allowed.join(", ")}`,
      );
    }
  }
}

function requireText(where, value, problems) {
  if (!nonEmptyString(value)) {
    problems.push(`${where} must be a non-empty string, not ${show(value)}`);
    return false;
  }
  return true;
}

/** An optional key: absent is fine, present must be non-empty text. */
function optionalText(where, value, problems) {
  if (value !== undefined) requireText(where, value, problems);
}

export function isRealDate(iso) {
  if (typeof iso !== "string") return false;
  const m = ISO_DATE.exec(iso);
  if (!m) return false;
  const d = new Date(`${iso}T00:00:00Z`);
  return (
    !Number.isNaN(d.getTime()) &&
    d.getUTCFullYear() === Number(m[1]) &&
    d.getUTCMonth() + 1 === Number(m[2]) &&
    d.getUTCDate() === Number(m[3])
  );
}

function requireDate(where, value, problems) {
  if (!isRealDate(value)) {
    problems.push(
      `${where} must be a calendar date like 2026-10-02, not ${show(value)}`,
    );
  }
}

/** A hash, full or shortened ("9b8ffaa4…8f919a68"), and nothing else. */
const BARE_HEX = /^(?:0x)?[0-9a-f]{8,}$/i;
const SHORT_HEX = /^[0-9a-f]{4,}\s*(?:…|\.{2,3})\s*[0-9a-f]{4,}$/i;
/** A Stellar account or contract id, full or shortened ("GABC…WXYZ"). */
const BARE_STRKEY = /^[GCM][A-Z2-7]{55}$/;
const SHORT_STRKEY = /^[GCM][A-Z2-7]{2,}\s*(?:…|\.{2,3})\s*[A-Z2-7]{3,}$/;

function isBareId(token) {
  return (
    BARE_HEX.test(token) ||
    SHORT_HEX.test(token) ||
    BARE_STRKEY.test(token) ||
    SHORT_STRKEY.test(token)
  );
}

/** The plain-language words in `text`: two or more letters, never an id. */
function plainWords(text) {
  return text
    .trim()
    .split(/\s+/)
    .map((t) => t.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""))
    .filter((t) => /\p{L}{2,}/u.test(t) && !isBareId(t));
}

/**
 * Why a link label is not plain language, or null when it is. A reviewer
 * reads the label to decide whether to click: a hash tells them nothing, so
 * a label must be at least two real words beside any id it quotes.
 */
export function labelProblem(label) {
  if (!nonEmptyString(label)) return `must be a non-empty string`;
  const text = label.trim();
  if (isBareId(text)) {
    return "is a bare hash or address; say in words what the link shows";
  }
  if (plainWords(text).length < 2) {
    return "must be at least two words of plain language, not just an id";
  }
  return null;
}

/** A mainnet explorer page, in any string anywhere in the index. */
const MAINNET_EXPLORER =
  /stellar\.expert\/explorer\/(?:public|mainnet)\b|stellarchain\.io|steexp\.com|horizon\.stellar\.org/i;

function findMainnet(value, where, problems) {
  if (typeof value === "string") {
    if (MAINNET_EXPLORER.test(value)) {
      problems.push(
        `${where} points at the Stellar mainnet (${show(value)}); this index is testnet only`,
      );
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => findMainnet(v, `${where}[${i}]`, problems));
    return;
  }
  if (isObject(value)) {
    for (const [k, v] of Object.entries(value)) {
      findMainnet(v, where ? `${where}.${k}` : k, problems);
    }
  }
}

/**
 * A link to one task: the console's receipt for it (/app/trace?task=…) or
 * the API's record of it (/api/tasks/<id>…). The backend keeps tasks in
 * memory only, so after a restart the link opens a "not found" receipt
 * while the index still offers it as proof (QA D-090). A task's settlement
 * and seal are on-chain and last; those are what to link.
 *
 * @param {URL} url
 */
function opensInMemoryTask(url) {
  if (url.pathname.replace(/\/+$/, "") === "/app/trace") {
    return url.searchParams.has("task");
  }
  return /^\/api\/tasks\/[^/]+/.test(url.pathname);
}

function checkLink(link, where, problems) {
  if (!isObject(link)) {
    problems.push(`${where} must be an object, not ${show(link)}`);
    return;
  }
  unknownKeys(where, link, LINK_KEYS, problems);

  const why = labelProblem(link.label);
  if (why) problems.push(`${where}.label ${why} (${show(link.label)})`);

  let url = null;
  if (typeof link.url !== "string") {
    problems.push(`${where}.url must be an https URL, not ${show(link.url)}`);
  } else {
    try {
      url = new URL(link.url);
    } catch {
      problems.push(`${where}.url is not a URL: ${show(link.url)}`);
    }
    if (url && url.protocol !== "https:") {
      problems.push(`${where}.url must use https, not ${show(link.url)}`);
      url = null;
    }
  }

  if (url && opensInMemoryTask(url)) {
    problems.push(
      `${where}.url opens a task, which the backend keeps only in memory and forgets on a restart; link its on-chain settlement or seal instead (${show(link.url)})`,
    );
  }

  if (!LINK_KINDS.includes(link.kind)) {
    problems.push(
      `${where}.kind must be one of ${LINK_KINDS.join(", ")}, not ${show(link.kind)}`,
    );
  }

  if (link.kind === "tx") {
    if (typeof link.tx_hash !== "string" || !TX_HASH.test(link.tx_hash)) {
      problems.push(
        `${where}.tx_hash must be 64 lowercase hex characters, not ${show(link.tx_hash)}`,
      );
    } else if (link.url !== testnetTxUrl(link.tx_hash)) {
      problems.push(
        `${where}.url must be exactly ${testnetTxUrl(link.tx_hash)} (the testnet page for its own tx_hash), not ${show(link.url)}`,
      );
    }
  } else if (link.tx_hash !== undefined) {
    problems.push(
      `${where}.tx_hash is only for a "tx" link; this one is ${show(link.kind)}`,
    );
  }

  if (link.kind === "contract" || link.kind === "account") {
    const [segment, pattern, shape] =
      link.kind === "contract"
        ? ["contract", CONTRACT_ID, "a C… contract id"]
        : ["account", ACCOUNT_ID, "a G… account id"];
    const prefix = `${EXPLORER}/${segment}/`;
    const id =
      typeof link.url === "string" && link.url.startsWith(prefix)
        ? link.url.slice(prefix.length)
        : null;
    if (id === null || !pattern.test(id)) {
      problems.push(
        `${where}.url must be ${prefix}<${shape}>, not ${show(link.url)}`,
      );
    }
  }

  if (
    url &&
    url.hostname === "stellar.expert" &&
    !url.pathname.startsWith("/explorer/testnet/")
  ) {
    problems.push(
      `${where}.url must be a testnet Stellar Expert page (/explorer/testnet/…), not ${show(link.url)}`,
    );
  }

  if (link.date !== undefined)
    requireDate(`${where}.date`, link.date, problems);
}

function checkLinks(links, where, problems) {
  if (!Array.isArray(links)) {
    problems.push(`${where} must be an array, not ${show(links)}`);
    return 0;
  }
  links.forEach((link, i) => checkLink(link, `${where}[${i}]`, problems));
  return links.length;
}

function checkItem(item, where, seen, problems) {
  if (!isObject(item)) {
    problems.push(`${where} must be an object, not ${show(item)}`);
    return;
  }
  unknownKeys(where, item, ITEM_KEYS, problems);
  if (requireText(`${where}.id`, item.id, problems)) {
    if (seen.has(item.id)) {
      problems.push(`${where}.id ${show(item.id)} is used twice`);
    }
    seen.add(item.id);
  }
  requireText(`${where}.claim`, item.claim, problems);
  const count = checkLinks(item.links, `${where}.links`, problems);
  if (!ITEM_STATUSES.includes(item.status)) {
    problems.push(
      `${where}.status must be one of ${ITEM_STATUSES.join(", ")}, not ${show(item.status)}`,
    );
    return;
  }
  if (item.status === "present") {
    if (count === 0) {
      problems.push(
        `${where} is "present" but has no links; nothing is present without its proof`,
      );
    }
    optionalText(`${where}.note`, item.note, problems);
  } else if (!nonEmptyString(item.note)) {
    problems.push(
      `${where} is "${item.status}", so its note must say why, plainly; it is ${show(item.note)}`,
    );
  }
}

function checkDeliverables(deliverables, problems) {
  if (!Array.isArray(deliverables)) {
    problems.push(`deliverables must be an array, not ${show(deliverables)}`);
    return;
  }
  const ids = deliverables.map((d) => (isObject(d) ? d.id : undefined));
  if (
    ids.length !== DELIVERABLE_IDS.length ||
    ids.some((id, i) => id !== DELIVERABLE_IDS[i])
  ) {
    problems.push(
      `deliverables must be exactly ${DELIVERABLE_IDS.join(", ")}, in that order (SOW §6.1); found ${ids.map(show).join(", ") || "none"}`,
    );
  }
  const seen = new Set();
  deliverables.forEach((d, i) => {
    const where = `deliverables[${i}]`;
    if (!isObject(d)) {
      problems.push(`${where} must be an object, not ${show(d)}`);
      return;
    }
    unknownKeys(where, d, DELIVERABLE_KEYS, problems);
    requireText(`${where}.name`, d.name, problems);
    const sow = SOW_6_1.find((row) => row.id === d.id);
    for (const key of ["evidence_type", "sow_text"]) {
      if (!requireText(`${where}.${key}`, d[key], problems) || !sow) continue;
      if (d[key] !== sow[key]) {
        problems.push(
          `${where}.${key} must quote SOW §6.1 verbatim for ${d.id}: ${show(sow[key])}, not ${show(d[key])}`,
        );
      }
    }
    if (!Array.isArray(d.items)) {
      problems.push(`${where}.items must be an array, not ${show(d.items)}`);
      return;
    }
    if (d.items.length === 0) {
      problems.push(`${where}.items must list at least one item`);
    }
    d.items.forEach((item, j) =>
      checkItem(item, `${where}.items[${j}]`, seen, problems),
    );
  });
}

/**
 * The metrics taken out of the sprint's requirements. Returns the §6.3 ids
 * the entries validly name, so the metrics check expects no row for them.
 * Absent means none were removed.
 */
function checkRemovedMetrics(removed, metrics, problems) {
  const out = new Set();
  if (removed === undefined) return out;
  if (!Array.isArray(removed)) {
    problems.push(`removed_metrics must be an array, not ${show(removed)}`);
    return out;
  }
  const present = new Set(
    Array.isArray(metrics)
      ? metrics.map((m) => (isObject(m) ? m.id : undefined))
      : [],
  );
  removed.forEach((r, i) => {
    const where = `removed_metrics[${i}]`;
    if (!isObject(r)) {
      problems.push(`${where} must be an object, not ${show(r)}`);
      return;
    }
    unknownKeys(where, r, REMOVED_METRIC_KEYS, problems);
    const sow = SOW_6_3.find((row) => row.id === r.id);
    if (!sow) {
      problems.push(
        `${where}.id must be a SOW §6.3 metric id, ${METRIC_IDS[0]} to ${METRIC_IDS.at(-1)}, not ${show(r.id)}`,
      );
    } else if (out.has(r.id)) {
      problems.push(`${where}.id ${show(r.id)} is listed twice`);
    } else if (present.has(r.id)) {
      problems.push(
        `${where}.id ${show(r.id)} is still in metrics; a removed metric has no row`,
      );
    } else {
      out.add(r.id);
    }
    if (requireText(`${where}.metric`, r.metric, problems) && sow) {
      if (r.metric !== sow.metric) {
        problems.push(
          `${where}.metric must quote SOW §6.3 verbatim for ${sow.id}: ${show(sow.metric)}, not ${show(r.metric)}`,
        );
      }
    }
    requireDate(`${where}.removed_on`, r.removed_on, problems);
    if (requireText(`${where}.note`, r.note, problems)) {
      if (plainWords(r.note).length < 2) {
        problems.push(
          `${where}.note must say why in at least two words of plain language (${show(r.note)})`,
        );
      }
    }
  });
  return out;
}

function checkMetrics(metrics, removed, problems) {
  if (!Array.isArray(metrics)) {
    problems.push(`metrics must be an array, not ${show(metrics)}`);
    return;
  }
  const ids = metrics.map((m) => (isObject(m) ? m.id : undefined));
  const expected = METRIC_IDS.filter((id) => !removed.has(id));
  if (
    ids.length !== expected.length ||
    ids.some((id, i) => id !== expected[i])
  ) {
    const frame = removed.size
      ? `metrics must be the SOW §6.3 metrics ${METRIC_IDS[0]} to ${METRIC_IDS.at(-1)} in order, less the removed ${[...removed].join(", ")}`
      : `metrics must be exactly the eleven of SOW §6.3, ${METRIC_IDS[0]} to ${METRIC_IDS.at(-1)} in order`;
    const unlisted = expected.filter((id) => !ids.includes(id));
    const why = unlisted.length
      ? `; ${unlisted.join(", ")} ${unlisted.length === 1 ? "is" : "are"} left out with no removed_metrics entry`
      : "";
    problems.push(
      `${frame}; found ${metrics.length}: ${ids.map(show).join(", ") || "none"}${why}`,
    );
  }
  metrics.forEach((m, i) => {
    const where = `metrics[${i}]`;
    if (!isObject(m)) {
      problems.push(`${where} must be an object, not ${show(m)}`);
      return;
    }
    unknownKeys(where, m, METRIC_KEYS, problems);
    const sow = SOW_6_3.find((row) => row.id === m.id);
    for (const key of ["category", "metric", "target"]) {
      if (!requireText(`${where}.${key}`, m[key], problems) || !sow) continue;
      if (m[key] !== sow[key]) {
        problems.push(
          `${where}.${key} must quote SOW §6.3 verbatim for ${m.id}: ${show(sow[key])}, not ${show(m[key])}`,
        );
      }
    }
    requireText(`${where}.achieved`, m.achieved, problems);
    requireText(`${where}.method`, m.method, problems);
    const count = checkLinks(m.links, `${where}.links`, problems);
    if (!METRIC_STATUSES.includes(m.status)) {
      problems.push(
        `${where}.status must be "met" or "not_met", not ${show(m.status)}`,
      );
    } else if (m.status === "not_met") {
      if (!nonEmptyString(m.reason)) {
        problems.push(
          `${where} is "not_met", so its reason must say why, plainly; it is ${show(m.reason)}`,
        );
      }
    } else {
      if (count === 0) {
        problems.push(
          `${where} is "met" but has no links; a met target needs its proof`,
        );
      }
      optionalText(`${where}.reason`, m.reason, problems);
    }
  });
}

function checkDisclosures(disclosures, problems) {
  if (!Array.isArray(disclosures)) {
    problems.push(`disclosures must be an array, not ${show(disclosures)}`);
    return;
  }
  const seen = new Set();
  disclosures.forEach((d, i) => {
    const where = `disclosures[${i}]`;
    if (!isObject(d)) {
      problems.push(`${where} must be an object, not ${show(d)}`);
      return;
    }
    unknownKeys(where, d, DISCLOSURE_KEYS, problems);
    if (requireText(`${where}.id`, d.id, problems)) {
      if (seen.has(d.id)) {
        problems.push(`${where}.id ${show(d.id)} is used twice`);
      }
      seen.add(d.id);
    }
    requireText(`${where}.title`, d.title, problems);
    requireText(`${where}.text`, d.text, problems);
    optionalText(`${where}.sow_ref`, d.sow_ref, problems);
    optionalText(`${where}.changed_since_sow`, d.changed_since_sow, problems);
  });
  const missing = REQUIRED_DISCLOSURES.filter((id) => !seen.has(id));
  if (missing.length) {
    problems.push(
      `disclosures must include ${REQUIRED_DISCLOSURES.join(", ")}; missing ${missing.join(", ")}`,
    );
  }
}

function checkNotes(notes, problems) {
  if (!Array.isArray(notes)) {
    problems.push(`notes must be an array, not ${show(notes)}`);
    return;
  }
  const seen = new Set();
  notes.forEach((n, i) => {
    const where = `notes[${i}]`;
    if (!isObject(n)) {
      problems.push(`${where} must be an object, not ${show(n)}`);
      return;
    }
    unknownKeys(where, n, NOTE_KEYS, problems);
    if (requireText(`${where}.id`, n.id, problems)) {
      if (seen.has(n.id)) {
        problems.push(`${where}.id ${show(n.id)} is used twice`);
      }
      seen.add(n.id);
    }
    requireText(`${where}.title`, n.title, problems);
    requireText(`${where}.text`, n.text, problems);
  });
}

/**
 * Check a parsed index. `ok` is true only when there are no problems.
 *
 * @param {unknown} obj the parsed content/evidence/index.json
 * @returns {{ ok: boolean, problems: string[] }}
 */
export function validateEvidenceIndex(obj) {
  /** @type {string[]} */
  const problems = [];
  if (!isObject(obj)) {
    problems.push(`the index must be a JSON object, not ${show(obj)}`);
    return { ok: false, problems };
  }
  unknownKeys("the index", obj, TOP_KEYS, problems);
  if (obj.schema !== SCHEMA) {
    problems.push(`schema must be "${SCHEMA}", not ${show(obj.schema)}`);
  }
  requireText("title", obj.title, problems);

  if (!isObject(obj.sow)) {
    problems.push(`sow must be an object, not ${show(obj.sow)}`);
  } else {
    unknownKeys("sow", obj.sow, SOW_KEYS, problems);
    if (obj.sow.version !== SOW_VERSION) {
      problems.push(
        `sow.version must be "${SOW_VERSION}", the approved SOW this index mirrors, not ${show(obj.sow.version)}`,
      );
    }
    requireDate("sow.date", obj.sow.date, problems);
    requireText("sow.note", obj.sow.note, problems);
  }

  if (!isObject(obj.snapshot)) {
    problems.push(`snapshot must be an object, not ${show(obj.snapshot)}`);
  } else {
    unknownKeys("snapshot", obj.snapshot, SNAPSHOT_KEYS, problems);
    requireDate("snapshot.as_of", obj.snapshot.as_of, problems);
    if (obj.snapshot.network !== "testnet") {
      problems.push(
        `snapshot.network must be "testnet"; the sprint is testnet only, not ${show(obj.snapshot.network)}`,
      );
    }
    requireText("snapshot.method", obj.snapshot.method, problems);
  }

  checkDeliverables(obj.deliverables, problems);
  checkMetrics(
    obj.metrics,
    checkRemovedMetrics(obj.removed_metrics, obj.metrics, problems),
    problems,
  );
  checkDisclosures(obj.disclosures, problems);
  checkNotes(obj.notes, problems);
  findMainnet(obj, "", problems);

  return { ok: problems.length === 0, problems };
}
