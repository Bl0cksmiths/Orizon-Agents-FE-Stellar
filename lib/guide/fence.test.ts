/**
 * Unit tests for lib/guide/fence.ts: the code-fence info strings.
 *
 * Each fence becomes a linkable, captioned, copyable block, so a fence
 * without an id, a title or a verify mode is a content error, not a block
 * rendered with blanks.
 */

import { describe, expect, it } from "vitest";
import { parseFenceInfo } from "./fence";

function problems(lang: string | null, meta: string | null): string[] {
  const result = parseFenceInfo(lang, meta);
  if (result.ok) throw new Error("expected problems");
  return result.problems;
}

describe("parseFenceInfo", () => {
  it("reads the language, id, verify mode and title", () => {
    expect(
      parseFenceInfo(
        "bash",
        'id="register-agent" verify="live" title="Register the agent"',
      ),
    ).toEqual({
      ok: true,
      fence: {
        lang: "bash",
        id: "register-agent",
        title: "Register the agent",
        verify: "live",
        response: false,
      },
    });
  });

  it("accepts attributes in any order and titles with punctuation", () => {
    const result = parseFenceInfo(
      "python",
      'title="Verify a dispatch (SEP-53), step 2" verify="manual"   id="verify-2"',
    );
    expect(result).toEqual({
      ok: true,
      fence: {
        lang: "python",
        id: "verify-2",
        title: "Verify a dispatch (SEP-53), step 2",
        verify: "manual",
        response: false,
      },
    });
  });

  it("marks a json block whose id ends in -response as a response", () => {
    const result = parseFenceInfo(
      "json",
      'id="register-agent-response" title="The registry answers"',
    );
    expect(result).toEqual({
      ok: true,
      fence: {
        lang: "json",
        id: "register-agent-response",
        title: "The registry answers",
        verify: null,
        response: true,
      },
    });
  });

  it("does not treat a -response id in another language as a response", () => {
    expect(problems("text", 'id="x-response" title="t"')).toEqual([
      '```text id="x-response" title="t": missing verify="…" (one of live, offline, manual)',
    ]);
  });

  it("rejects a fence with no info string", () => {
    expect(problems(null, null)).toEqual([
      'a code fence has no info string; write ```<lang> id="…" verify="…" title="…" with lang one of bash, json, python, js, text, env',
    ]);
  });

  it("rejects an unknown language", () => {
    expect(problems("ts", 'id="a" verify="offline" title="t"')).toEqual([
      '```ts id="a" verify="offline" title="t": language "ts" is not one of bash, json, python, js, text, env',
    ]);
  });

  it("reports every missing attribute together", () => {
    expect(problems("bash", "")).toEqual([
      '```bash: missing id="…"',
      '```bash: missing title="…"',
      '```bash: missing verify="…" (one of live, offline, manual)',
    ]);
  });

  it.each([
    [
      'id="Register_Agent" verify="live" title="t"',
      'id "Register_Agent" is not kebab-case',
    ],
    [
      'id="a" verify="sometimes" title="t"',
      'verify "sometimes" is not one of live, offline, manual',
    ],
    ['id="a" verify="live" title="  "', "title is empty"],
    [
      'id="a" verify="live" title="t" lang="x"',
      'unknown attribute "lang" (expected id, verify, title, schema, status)',
    ],
    ['id="a" id="b" verify="live" title="t"', 'attribute "id" is given twice'],
    [
      'id=a verify="live" title="t"',
      'could not read "id=a verify="live" title="t""; attributes are written key="value"',
    ],
  ])("rejects %s", (meta, problem) => {
    expect(problems("bash", meta).join("\n")).toContain(problem);
  });
});

describe("parseFenceInfo — the verifier's attributes", () => {
  it("accepts schema= on a json sample and status= on a -response block", () => {
    expect(
      parseFenceInfo(
        "json",
        'id="taken" verify="offline" schema="AgentIdAvailability" title="t"',
      ).ok,
    ).toBe(true);
    expect(
      parseFenceInfo("json", 'id="build-response" status="422" title="t"').ok,
    ).toBe(true);
  });

  it.each([
    [
      "bash",
      'id="a" verify="live" schema="X" title="t"',
      "schema= only applies to a json block",
    ],
    [
      "json",
      'id="a-response" schema="X" title="t"',
      "schema= does not apply to a -response block",
    ],
    [
      "json",
      'id="a" verify="offline" schema="not a name" title="t"',
      'schema "not a name" is not a contract schema name',
    ],
    [
      "json",
      'id="a" verify="offline" status="422" title="t"',
      "status= only applies to a -response block",
    ],
    [
      "json",
      'id="a-response" status="42" title="t"',
      'status "42" is not an HTTP status',
    ],
    [
      "json",
      'id="a-response" status="600" title="t"',
      'status "600" is not an HTTP status',
    ],
  ])("rejects %s %s", (lang, meta, problem) => {
    expect(problems(lang, meta).join("\n")).toContain(problem);
  });
});
