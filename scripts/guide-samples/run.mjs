/**
 * One pass over the guide: parse, static checks for every sample, then the
 * requested executions. Every sample ends in exactly one status:
 *
 *   verified  every check that applies to its mode ran and passed
 *   failed    a check ran and did not pass (or the sample cannot run as labelled)
 *   skipped   a check that applies was not run — with the reason. NEVER verified.
 *
 * A `manual` sample is verified by its static checks alone: it is never
 * executed by design. A `live` or `offline` sample is only verified by a run
 * that executed it (`--live`, `--offline`); a static-only run reports it as
 * skipped, so "0 failed" on a static run never reads as "every sample ran".
 */
import { existsSync, readFileSync } from "node:fs";
import { checkHttpSample } from "./contract.mjs";
import { fixtureEnv, SECRET_FIXTURES } from "./fixtures.mjs";
import { lintSample } from "./lint.mjs";
import { preflight, runLive } from "./live.mjs";
import { resolvePython, runOffline } from "./offline.mjs";
import { parseGuide } from "./parse.mjs";
import {
  envForSample,
  loadSamplesEnv,
  staleSampleIds,
} from "./samples-env.mjs";
import { createValidator, docWildcards } from "./schema.mjs";
import { parseCurlSample, resolveWord, sessionEnv } from "./shell.mjs";
import { checkShaDrift, loadSnapshot } from "./snapshot.mjs";

/**
 * @typedef {{ name: string, status: "verified" | "failed" | "skipped", detail: string }} Check
 * @typedef {{
 *   id: string, title: string | undefined, lang: string, mode: string | undefined, line: number,
 *   operation?: string, status: "verified" | "failed" | "skipped", reason: string,
 *   checks: Check[], diff?: string, extra?: string[], output?: string,
 * }} SampleResult
 * @typedef {{
 *   guide: string, snapshot: string, frontmatter: Record<string, string>, backendSha?: string,
 *   modes: { static: true, live: boolean, offline: boolean }, api?: string, network?: string,
 *   guideErrors: string[], samples: SampleResult[], samplesEnv?: string,
 *   counts: { verified: number, failed: number, skipped: number },
 * }} GuideReport
 */

/**
 * @param {{
 *   guidePath: string, snapshotPath: string, repoRoot: string, samplesEnvPath?: string,
 *   live?: boolean, offline?: boolean, api?: string,
 *   liveOptions?: import("./live.mjs").LiveOptions,
 *   timeoutMs?: number, python?: { python: string } | { skip: string }, useUnshare?: boolean,
 * }} options
 * @returns {Promise<GuideReport>}
 */
export async function checkGuide(options) {
  const {
    guidePath,
    snapshotPath,
    repoRoot,
    live = false,
    offline = false,
    api,
  } = options;
  /** @type {GuideReport} */
  const report = {
    guide: guidePath,
    snapshot: snapshotPath,
    frontmatter: {},
    modes: { static: true, live, offline },
    ...(live ? { api } : {}),
    guideErrors: [],
    samples: [],
    counts: { verified: 0, failed: 0, skipped: 0 },
  };
  const finish = () => {
    for (const s of report.samples) report.counts[s.status] += 1;
    return report;
  };

  if (!existsSync(guidePath)) {
    report.guideErrors.push(
      `guide not found at ${guidePath}: there is nothing to verify, and a check that verified nothing does not pass`,
    );
    return finish();
  }
  const parsed = parseGuide(readFileSync(guidePath, "utf8"));
  report.frontmatter = parsed.frontmatter;

  /** Errors that name a fence belong to that fence's sample. */
  const errorsById = new Map();
  for (const e of parsed.errors) {
    const owner =
      e.id === undefined ? undefined : parsed.fences.find((f) => f.id === e.id);
    const sampleId = owner?.attachedTo ?? owner?.id;
    if (
      sampleId === undefined ||
      !parsed.samples.some((s) => s.id === sampleId)
    ) {
      report.guideErrors.push(`line ${e.line}: ${e.message}`);
    } else {
      errorsById.set(sampleId, [
        ...(errorsById.get(sampleId) ?? []),
        `line ${e.line}: ${e.message}`,
      ]);
    }
  }
  if (parsed.samples.length === 0)
    report.guideErrors.push("the guide has no code samples");

  let snapshot;
  let validator;
  try {
    snapshot = loadSnapshot(snapshotPath);
    report.backendSha = snapshot.meta.backend_sha;
    validator = createValidator(snapshot.doc);
    validator.assertSupported();
    const drift = checkShaDrift(
      parsed.frontmatter.api_verified_against,
      snapshot.meta.backend_sha,
    );
    if (drift !== null) report.guideErrors.push(drift);
  } catch (err) {
    report.guideErrors.push(err instanceof Error ? err.message : String(err));
    validator = undefined;
  }

  const fixtures = fixtureEnv();
  const publicFixtures = Object.fromEntries(
    Object.entries(fixtures).filter(([k]) => !SECRET_FIXTURES.has(k)),
  );
  const fixtureNames = new Set(Object.keys(fixtures));

  /** @type {import("./samples-env.mjs").SamplesEnv | null} */
  let samplesEnv = null;
  if (options.samplesEnvPath !== undefined) {
    try {
      samplesEnv = loadSamplesEnv(options.samplesEnvPath);
      if (samplesEnv !== null) {
        report.samplesEnv = options.samplesEnvPath;
        const ids = parsed.samples.map((s) => s.id);
        for (const id of staleSampleIds(samplesEnv, ids)) {
          report.guideErrors.push(
            `${options.samplesEnvPath} names sample ${id}, which the guide does not have`,
          );
        }
        for (const id of ids)
          envForSample(samplesEnv, id, fixtures, fixtureNames);
      }
    } catch (err) {
      report.guideErrors.push(
        `${options.samplesEnvPath}: ${err instanceof Error ? err.message : err}`,
      );
      samplesEnv = null;
    }
  }

  let liveGate;
  if (live && parsed.samples.some((s) => s.verify === "live")) {
    if (api === undefined)
      liveGate = { ok: false, problem: "--live needs --api <base>" };
    else liveGate = await preflight(api, options.liveOptions);
    if (liveGate.ok) report.network = liveGate.network;
    else report.guideErrors.push(liveGate.problem);
  }
  const python =
    offline &&
    parsed.samples.some((s) => s.verify === "offline" && s.lang === "python")
      ? (options.python ?? resolvePython())
      : undefined;

  /** The guide's own shell session, fence by fence, as a reader would build it. */
  const staticSession = {};
  const liveSession = {
    ...publicFixtures,
    ...(api ? { ORIZON_API: api } : {}),
  };
  const pinned = new Set(["ORIZON_API"]);

  for (const fence of parsed.fences) {
    if (fence.kind !== "sample") continue;
    const sample = fence;
    const staticEnv =
      sample.lang === "bash"
        ? sessionEnv([sample.code], staticSession)
        : { ...staticSession };
    const liveEnv =
      sample.lang === "bash"
        ? sessionEnv([sample.code], liveSession, pinned)
        : { ...liveSession };
    if (sample.lang === "bash") {
      Object.assign(staticSession, sessionEnv([sample.code], staticSession));
      Object.assign(
        liveSession,
        sessionEnv([sample.code], liveSession, pinned),
      );
    }

    /** @type {SampleResult} */
    const result = {
      id: sample.id,
      title: sample.title,
      lang: sample.lang,
      mode: sample.verify,
      line: sample.line,
      status: "verified",
      reason: "",
      checks: [],
    };
    report.samples.push(result);
    const fail = (name, detail) =>
      result.checks.push({ name, status: "failed", detail });

    const parseErrors = errorsById.get(sample.id) ?? [];
    if (parseErrors.length > 0) fail("parse", parseErrors.join("\n"));
    else
      result.checks.push({
        name: "parse",
        status: "verified",
        detail: "fence, id and attachments are well formed",
      });

    let contract;
    if (sample.http) {
      if (validator === undefined) {
        fail("contract", "no usable OpenAPI snapshot; see the guide errors");
      } else {
        contract = checkHttpSample({
          sample,
          doc: snapshot.doc,
          validator,
          env: staticEnv,
          apiBase: parsed.apiBase,
        });
        result.operation = contract.operation;
        if (contract.ok) {
          result.checks.push({
            name: "contract",
            status: "verified",
            detail: `${contract.operation} — request and documented ${contract.status} response match the snapshot`,
          });
        } else {
          fail("contract", contract.problems.join("\n"));
        }
      }
    } else if (sample.external) {
      result.checks.push(lintExternalCurl(sample, staticEnv, parsed.apiBase));
    } else {
      const lint = lintSample(sample);
      result.checks.push({ name: "lint", ...lint, detail: lint.reason });
      if (
        sample.lang === "json" &&
        sample.attrs.schema !== undefined &&
        lint.status === "verified"
      ) {
        result.checks.push(checkJsonSchema(sample, snapshot?.doc, validator));
      }
    }

    const staticFailed = result.checks.some((c) => c.status === "failed");
    if (sample.verify === "live") {
      if (!live) {
        result.checks.push({
          name: "live",
          status: "skipped",
          detail: "not executed: this run did not use --live",
        });
      } else if (staticFailed) {
        result.checks.push({
          name: "live",
          status: "skipped",
          detail: "not executed: its static checks failed",
        });
      } else if (!liveGate?.ok) {
        fail("live", `not executed: ${liveGate?.problem ?? "no live gate"}`);
      } else {
        const run = await runLive(sample, {
          env: {
            ...liveEnv,
            ...envForSample(samplesEnv, sample.id, publicFixtures),
            ORIZON_API: /** @type {string} */ (api),
          },
          api: /** @type {string} */ (api),
          wildcards: contract?.wildcards ?? new Map(),
          status: contract?.status ?? "200",
          options: options.liveOptions,
        });
        result.checks.push({
          name: "live",
          status: run.status,
          detail: run.reason,
        });
        if (run.diff) result.diff = run.diff;
        if (run.extra?.length) result.extra = run.extra;
        if (run.status === "failed" && run.stdout) result.output = run.stdout;
      }
    } else if (sample.verify === "offline" && sample.lang === "json") {
      // Nothing to execute: its static checks above are the whole check.
    } else if (sample.verify === "offline") {
      if (!offline) {
        result.checks.push({
          name: "offline",
          status: "skipped",
          detail: "not executed: this run did not use --offline",
        });
      } else if (staticFailed) {
        result.checks.push({
          name: "offline",
          status: "skipped",
          detail: "not executed: its static checks failed",
        });
      } else {
        const run = await runOffline(sample, {
          env: {
            ...fixtures,
            ...staticEnv,
            ...envForSample(samplesEnv, sample.id, fixtures),
          },
          repoRoot,
          timeoutMs: options.timeoutMs,
          python,
          useUnshare: options.useUnshare,
        });
        result.checks.push({
          name: "offline",
          status: run.status,
          detail: run.sandbox ? `${run.reason} [${run.sandbox}]` : run.reason,
        });
        if (run.diff) result.diff = run.diff;
        if (run.status === "failed" && (run.stdout || run.stderr)) {
          result.output = [run.stdout, run.stderr]
            .filter(Boolean)
            .join("\n--- stderr ---\n")
            .slice(0, 4000);
        }
      }
    }

    const failed = result.checks.filter((c) => c.status === "failed");
    const skipped = result.checks.filter((c) => c.status === "skipped");
    if (failed.length > 0) {
      result.status = "failed";
      result.reason = failed
        .map((c) => `${c.name}: ${c.detail.split("\n")[0]}`)
        .join("; ");
    } else if (skipped.length > 0) {
      result.status = "skipped";
      result.reason = skipped.map((c) => `${c.name}: ${c.detail}`).join("; ");
    } else {
      result.status = "verified";
      result.reason =
        sample.verify === "manual"
          ? "manual — statically checked, never executed"
          : sample.lang === "json"
            ? `json — nothing to execute; ${result.checks.map((c) => c.name).join(" + ")}`
            : result.checks.map((c) => c.name).join(" + ");
    }
  }
  return finish();
}

/** @param {GuideReport} report */
export const reportFailed = (report) =>
  report.guideErrors.length > 0 || report.counts.failed > 0;

/**
 * A curl to a host other than $ORIZON_API: it must parse as one curl, and must
 * not be an API call written without $ORIZON_API (which would dodge the
 * contract check).
 *
 * @param {import("./parse.mjs").Fence} sample
 * @param {Record<string, string>} env
 * @param {string | undefined} apiBase
 * @returns {Check}
 */
function lintExternalCurl(sample, env, apiBase) {
  try {
    const { request } = parseCurlSample(sample.code);
    const url = resolveWord(request.url, env);
    if (apiBase !== undefined && url.startsWith(apiBase)) {
      return {
        name: "lint",
        status: "failed",
        detail: `${url} is the API: write it as $ORIZON_API so it is checked`,
      };
    }
    return {
      name: "lint",
      status: "verified",
      detail: "external curl: parses; outside the API contract",
    };
  } catch (err) {
    return {
      name: "lint",
      status: "failed",
      detail: `the curl does not parse: ${err instanceof Error ? err.message : err}`,
    };
  }
}

/**
 * A json sample that names a contract schema, validated against it.
 *
 * @param {import("./parse.mjs").Fence} sample
 * @param {Record<string, any> | undefined} doc
 * @param {ReturnType<typeof createValidator> | undefined} validator
 * @returns {Check}
 */
function checkJsonSchema(sample, doc, validator) {
  const name = sample.attrs.schema;
  if (validator === undefined || doc === undefined) {
    return {
      name: "schema",
      status: "failed",
      detail: "no usable OpenAPI snapshot; see the guide errors",
    };
  }
  if (!Object.hasOwn(doc.components?.schemas ?? {}, name)) {
    return {
      name: "schema",
      status: "failed",
      detail: `schema=${name} is not a schema in the OpenAPI snapshot`,
    };
  }
  const { errors } = validator.validate(
    { $ref: `#/components/schemas/${name}` },
    JSON.parse(sample.code),
    {
      wildcard: docWildcards,
    },
  );
  return errors.length === 0
    ? { name: "schema", status: "verified", detail: `matches ${name}` }
    : {
        name: "schema",
        status: "failed",
        detail: errors.map((e) => `${e.path}: ${e.message}`).join("\n"),
      };
}
