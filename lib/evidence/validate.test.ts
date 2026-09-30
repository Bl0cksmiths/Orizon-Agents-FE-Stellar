/**
 * Unit tests for lib/evidence/validate.mjs: every rule the evidence index is
 * held to at build. Each test starts from the fixture index, which passes,
 * breaks one thing, and expects the problem that names it, so a failure says
 * which rule let a bad index through.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SOW_6_1, SOW_6_3 } from "./sow.mjs";
import {
  labelProblem,
  testnetTxUrl,
  validateEvidenceIndex,
} from "./validate.mjs";

const FIXTURE = path.resolve(
  __dirname,
  "../../test/fixtures/evidence/index.json",
);
const SKELETON = path.resolve(__dirname, "../../content/evidence/index.json");

type Json = Record<string, any>;

/** A fresh, valid index to break. */
function base(): Json {
  return JSON.parse(readFileSync(FIXTURE, "utf8"));
}

function problemsOf(index: unknown): string[] {
  const { ok, problems } = validateEvidenceIndex(index);
  expect(ok).toBe(problems.length === 0);
  return problems;
}

/** Break the index with `mutate`, then expect exactly one problem, matching `pattern`. */
function expectOnly(mutate: (index: Json) => void, pattern: RegExp) {
  const index = base();
  mutate(index);
  const problems = problemsOf(index);
  expect(problems).toHaveLength(1);
  expect(problems[0]).toMatch(pattern);
}

const firstLink = (i: Json) => i.deliverables[0].items[0].links[0];
const txLink = (i: Json) => i.deliverables[0].items[2].links[0];
const contractLink = (i: Json) => i.deliverables[4].items[1].links[0];
const accountLink = (i: Json) => i.deliverables[4].items[1].links[1];

describe("a valid index", () => {
  it("passes: the fixture", () => {
    expect(validateEvidenceIndex(base())).toEqual({ ok: true, problems: [] });
  });

  it("passes: the committed skeleton", () => {
    const skeleton = JSON.parse(readFileSync(SKELETON, "utf8"));
    expect(validateEvidenceIndex(skeleton)).toEqual({
      ok: true,
      problems: [],
    });
  });

  it("reports every problem at once, not just the first", () => {
    const index = base();
    index.schema = "orizon.evidence-index/2";
    index.snapshot.network = "mainnet";
    index.metrics.pop();
    expect(problemsOf(index)).toHaveLength(3);
  });
});

describe("the frame", () => {
  it("rejects a non-object", () => {
    expect(problemsOf([])).toEqual([
      "the index must be a JSON object, not an array",
    ]);
    expect(problemsOf(null)).toEqual([
      "the index must be a JSON object, not null",
    ]);
  });

  it("requires the schema string", () => {
    expectOnly((i) => {
      i.schema = "orizon.evidence-index/2";
    }, /^schema must be "orizon\.evidence-index\/1"/);
  });

  it("requires a title", () => {
    expectOnly((i) => {
      i.title = "  ";
    }, /^title must be a non-empty string/);
  });

  it("requires the approved SOW version", () => {
    expectOnly((i) => {
      i.sow.version = "v3";
    }, /^sow\.version must be "v4"/);
  });

  it("requires the network to be testnet", () => {
    expectOnly((i) => {
      i.snapshot.network = "mainnet";
    }, /^snapshot\.network must be "testnet"/);
  });

  it("requires a snapshot method", () => {
    expectOnly((i) => {
      delete i.snapshot.method;
    }, /^snapshot\.method must be a non-empty string, not missing/);
  });
});

describe("dates", () => {
  for (const bad of ["2026-02-30", "2026-9-29", "29/09/2026", "", 20260929]) {
    it(`rejects ${JSON.stringify(bad)} as a date`, () => {
      expectOnly((i) => {
        i.snapshot.as_of = bad;
      }, /^snapshot\.as_of must be a calendar date like 2026-10-02/);
    });
  }

  it("checks the SOW date", () => {
    expectOnly((i) => {
      i.sow.date = "2026-13-01";
    }, /^sow\.date must be a calendar date/);
  });

  it("checks a link's optional date", () => {
    expectOnly((i) => {
      txLink(i).date = "yesterday";
    }, /^deliverables\[0\]\.items\[2\]\.links\[0\]\.date must be a calendar date/);
  });

  it("allows a link with no date", () => {
    const index = base();
    delete txLink(index).date;
    expect(problemsOf(index)).toEqual([]);
  });
});

describe("unknown keys", () => {
  const cases: [string, (i: Json) => Json][] = [
    ["the index", (i) => i],
    ["sow", (i) => i.sow],
    ["snapshot", (i) => i.snapshot],
    ["deliverables[0]", (i) => i.deliverables[0]],
    ["deliverables[0].items[0]", (i) => i.deliverables[0].items[0]],
    ["deliverables[0].items[0].links[0]", firstLink],
    ["metrics[0]", (i) => i.metrics[0]],
    ["disclosures[0]", (i) => i.disclosures[0]],
    ["notes[0]", (i) => i.notes[0]],
  ];
  for (const [where, at] of cases) {
    it(`rejects one on ${where}`, () => {
      const escaped = where.replace(/[[\].]/g, "\\$&");
      expectOnly(
        (i) => {
          at(i).verifed = true;
        },
        new RegExp(`^${escaped} has an unknown key "verifed"`),
      );
    });
  }
});

describe("deliverables mirror SOW §6.1", () => {
  it("must be D1, D2, D3, D4 and RD in that order", () => {
    expectOnly((i) => {
      const [d1, d2] = i.deliverables;
      i.deliverables[0] = d2;
      i.deliverables[1] = d1;
    }, /^deliverables must be exactly D1, D2, D3, D4, RD, in that order \(SOW §6\.1\); found "D2", "D1", "D3", "D4", "RD"$/);
  });

  it("must not leave one out", () => {
    expectOnly((i) => {
      i.deliverables.pop();
    }, /^deliverables must be exactly D1, D2, D3, D4, RD.*found "D1", "D2", "D3", "D4"$/);
  });

  it("must not add one", () => {
    const index = base();
    index.deliverables.push({ ...index.deliverables[4], id: "D5" });
    const problems = problemsOf(index);
    expect(problems[0]).toMatch(/^deliverables must be exactly/);
  });

  it("must quote the Evidence Type verbatim", () => {
    expectOnly((i) => {
      i.deliverables[1].evidence_type = "Screen recording, screenshots";
    }, /^deliverables\[1\]\.evidence_type must quote SOW §6\.1 verbatim for D2/);
  });

  it("must quote the Description verbatim, to the character", () => {
    expectOnly((i) => {
      // A hyphen for the SOW's en dash.
      i.deliverables[3].sow_text = SOW_6_1[3].sow_text.replace("3–5", "3-5");
    }, /^deliverables\[3\]\.sow_text must quote SOW §6\.1 verbatim for D4/);
  });

  it("must name each deliverable", () => {
    expectOnly((i) => {
      i.deliverables[2].name = "";
    }, /^deliverables\[2\]\.name must be a non-empty string/);
  });

  it("must list at least one item", () => {
    expectOnly((i) => {
      i.deliverables[2].items = [];
    }, /^deliverables\[2\]\.items must list at least one item$/);
  });

  it("must not reuse an item id", () => {
    expectOnly((i) => {
      i.deliverables[1].items[0].id = "6.1-D1-a";
    }, /^deliverables\[1\]\.items\[0\]\.id "6\.1-D1-a" is used twice$/);
  });
});

describe("items", () => {
  it("rejects an unknown status", () => {
    expectOnly((i) => {
      i.deliverables[0].items[0].status = "done";
    }, /^deliverables\[0\]\.items\[0\]\.status must be one of present, partial, missing/);
  });

  it("a present item needs at least one link", () => {
    expectOnly((i) => {
      i.deliverables[0].items[0].links = [];
    }, /^deliverables\[0\]\.items\[0\] is "present" but has no links/);
  });

  for (const status of ["partial", "missing"]) {
    it(`a ${status} item needs a note saying why`, () => {
      expectOnly(
        (i) => {
          const item = i.deliverables[1].items[status === "partial" ? 1 : 2];
          expect(item.status).toBe(status);
          delete item.note;
        },
        new RegExp(
          `is "${status}", so its note must say why, plainly; it is missing$`,
        ),
      );
    });
  }

  it("a blank note is no note", () => {
    expectOnly((i) => {
      i.deliverables[2].items[0].note = "   ";
    }, /is "missing", so its note must say why/);
  });

  it("a missing item may have no links", () => {
    const index = base();
    expect(index.deliverables[2].items[0].links).toEqual([]);
    expect(problemsOf(index)).toEqual([]);
  });

  it("links must be an array", () => {
    expectOnly((i) => {
      i.deliverables[2].items[0].links = null;
    }, /^deliverables\[2\]\.items\[0\]\.links must be an array, not null$/);
  });
});

describe("link labels are plain language", () => {
  const bare: [string, string][] = [
    ["a full transaction hash", "a".repeat(64)],
    ["a shortened hash", "9b8ffaa4…8f919a68"],
    ["a 0x hash", "0xdeadbeefcafe"],
    ["a full account address", `G${"A".repeat(55)}`],
    ["a full contract address", `C${"B".repeat(55)}`],
    ["a shortened address", "GABC…WXYZ"],
    ["a shortened address with dots", "CAPH...J3GQ"],
  ];
  for (const [what, label] of bare) {
    it(`rejects ${what}`, () => {
      expectOnly((i) => {
        txLink(i).label = label;
      }, /\.label is a bare hash or address; say in words what the link shows/);
    });
  }

  it("rejects a single word", () => {
    expectOnly((i) => {
      firstLink(i).label = "Link";
    }, /\.label must be at least two words of plain language/);
  });

  it("rejects one word beside a hash", () => {
    expect(labelProblem("Tx 9b8ffaa4…8f919a68")).toMatch(/at least two words/);
    expect(labelProblem(`Account G${"A".repeat(55)}`)).toMatch(
      /at least two words/,
    );
  });

  it("rejects an empty label", () => {
    expectOnly((i) => {
      firstLink(i).label = "";
    }, /\.label must be a non-empty string/);
  });

  it("accepts words that quote an id", () => {
    expect(labelProblem("Registration by outside operator GABC…WXYZ")).toBe(
      null,
    );
    expect(labelProblem("Merged PR #42")).toBe(null);
  });
});

describe("link URLs", () => {
  it("must be https", () => {
    expectOnly((i) => {
      firstLink(i).url = "http://example.com/fixture/pull/1";
    }, /\.url must use https/);
  });

  it("must not be mailto", () => {
    expectOnly((i) => {
      firstLink(i).url = "mailto:team@example.com";
    }, /\.url must use https/);
  });

  it("must be a URL", () => {
    expectOnly((i) => {
      firstLink(i).url = "orizons.xyz/app";
    }, /\.url is not a URL/);
  });

  it("must have a known kind", () => {
    expectOnly((i) => {
      firstLink(i).kind = "tweet";
    }, /\.kind must be one of tx, contract, account, page, pr, repo, video, doc/);
  });
});

describe("transaction links", () => {
  it("must link the testnet page for their own hash", () => {
    expectOnly((i) => {
      txLink(i).url = testnetTxUrl("2".repeat(64));
    }, /\.url must be exactly https:\/\/stellar\.expert\/explorer\/testnet\/tx\/1{64} \(the testnet page for its own tx_hash\)/);
  });

  it("must carry a 64-character lowercase hex hash", () => {
    for (const bad of ["A".repeat(64), "1".repeat(63), undefined]) {
      expectOnly((i) => {
        txLink(i).tx_hash = bad;
      }, /\.tx_hash must be 64 lowercase hex characters/);
    }
  });

  it("only a tx link carries a tx_hash", () => {
    expectOnly((i) => {
      firstLink(i).tx_hash = "1".repeat(64);
    }, /\.tx_hash is only for a "tx" link; this one is "pr"/);
  });
});

describe("contract and account links", () => {
  it("a contract link is the testnet contract page for a C… id", () => {
    expectOnly((i) => {
      contractLink(i).url =
        "https://stellar.expert/explorer/testnet/contract/CAPH";
    }, /\.url must be https:\/\/stellar\.expert\/explorer\/testnet\/contract\/<a C… contract id>/);
  });

  it("an account link is the testnet account page for a G… id", () => {
    expectOnly((i) => {
      accountLink(i).url =
        `https://stellar.expert/explorer/testnet/contract/C${"A".repeat(55)}`;
    }, /\.url must be https:\/\/stellar\.expert\/explorer\/testnet\/account\/<a G… account id>/);
  });
});

describe("no mainnet anywhere", () => {
  it("rejects a mainnet transaction page", () => {
    const index = base();
    const link = txLink(index);
    link.url = link.url.replace("/testnet/", "/public/");
    const problems = problemsOf(index);
    expect(problems.some((p) => /points at the Stellar mainnet/.test(p))).toBe(
      true,
    );
    expect(problems.some((p) => /must be exactly/.test(p))).toBe(true);
  });

  it("rejects a mainnet explorer page on any kind of link", () => {
    const index = base();
    firstLink(index).url =
      "https://stellar.expert/explorer/public/account/GAAA";
    const problems = problemsOf(index);
    expect(problems).toContain(
      'deliverables[0].items[0].links[0].url points at the Stellar mainnet ("https://stellar.expert/explorer/public/account/GAAA"); this index is testnet only',
    );
    expect(problems).toContain(
      'deliverables[0].items[0].links[0].url must be a testnet Stellar Expert page (/explorer/testnet/…), not "https://stellar.expert/explorer/public/account/GAAA"',
    );
  });

  it("rejects a mainnet explorer URL even in prose", () => {
    expectOnly((i) => {
      i.notes[0].text = "See https://stellar.expert/explorer/public/tx/abc.";
    }, /^notes\[0\]\.text points at the Stellar mainnet/);
  });
});

describe("metrics mirror SOW §6.3", () => {
  it("must be eleven, not ten", () => {
    expectOnly((i) => {
      i.metrics.pop();
    }, /^metrics must be exactly the eleven of SOW §6\.3, m01 to m11 in order; found 10:/);
  });

  it("must be eleven, not twelve", () => {
    expectOnly((i) => {
      i.metrics.push({ ...i.metrics[10], id: "m12" });
    }, /^metrics must be exactly the eleven of SOW §6\.3, m01 to m11 in order; found 12:/);
  });

  it("must be in order", () => {
    expectOnly((i) => {
      i.metrics.reverse();
    }, /^metrics must be exactly the eleven.*found 11: "m11", "m10"/);
  });

  for (const key of ["category", "metric", "target"]) {
    it(`must quote the ${key} verbatim`, () => {
      expectOnly(
        (i) => {
          i.metrics[0][key] = `${SOW_6_3[0][key as "metric"]} `;
        },
        new RegExp(
          `^metrics\\[0\\]\\.${key} must quote SOW §6\\.3 verbatim for m01`,
        ),
      );
    });
  }

  it("a not_met metric must give its reason", () => {
    expectOnly((i) => {
      expect(i.metrics[2].status).toBe("not_met");
      delete i.metrics[2].reason;
    }, /^metrics\[2\] is "not_met", so its reason must say why, plainly; it is missing$/);
  });

  it("a met metric must link its proof", () => {
    expectOnly((i) => {
      expect(i.metrics[0].status).toBe("met");
      i.metrics[0].links = [];
    }, /^metrics\[0\] is "met" but has no links/);
  });

  it("rejects an unknown status", () => {
    expectOnly((i) => {
      i.metrics[0].status = "partly";
    }, /^metrics\[0\]\.status must be "met" or "not_met"/);
  });

  it("needs the achieved value and the method", () => {
    const index = base();
    delete index.metrics[4].achieved;
    index.metrics[4].method = "";
    expect(problemsOf(index)).toEqual([
      "metrics[4].achieved must be a non-empty string, not missing",
      'metrics[4].method must be a non-empty string, not ""',
    ]);
  });

  it("checks the links on a metric", () => {
    expectOnly((i) => {
      i.metrics[0].links[0].label = "f".repeat(64);
    }, /^metrics\[0\]\.links\[0\]\.label is a bare hash/);
  });
});

describe("removed metrics", () => {
  const M03 = "Workflows routed to external agents & settled on Testnet";
  const ENTRY = {
    id: "m03",
    metric: M03,
    removed_on: "2026-09-30",
    note: "Removed from the sprint's requirements by the team lead.",
  };

  /** The index with m03 taken out of the table and listed as removed. */
  function removed(): Json {
    const index = base();
    index.metrics = index.metrics.filter((m: Json) => m.id !== "m03");
    index.removed_metrics = [{ ...ENTRY }];
    return index;
  }

  function expectOnlyRemoved(mutate: (i: Json) => void, pattern: RegExp) {
    const index = removed();
    mutate(index);
    const problems = problemsOf(index);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(pattern);
  }

  it("passes: a metric taken out of the table with its entry", () => {
    expect(problemsOf(removed())).toEqual([]);
  });

  it("passes: none removed, with the key absent or empty", () => {
    const index = removed();
    delete index.removed_metrics;
    index.metrics.splice(2, 0, {
      ...SOW_6_3[2],
      achieved: "0",
      status: "not_met",
      reason: "Not reached in the fixture.",
      method: "Counted in the fixture.",
      links: [],
    });
    expect(index.metrics.map((m: Json) => m.id)).toEqual(
      SOW_6_3.map((m) => m.id),
    );
    expect(problemsOf(index)).toEqual([]);
    index.removed_metrics = [];
    expect(problemsOf(index)).toEqual([]);
  });

  it("passes: more than one removed", () => {
    const index = removed();
    index.metrics = index.metrics.filter((m: Json) => m.id !== "m10");
    index.removed_metrics.push({
      id: "m10",
      metric: SOW_6_3[9].metric,
      removed_on: "2026-10-01",
      note: "Removed by the team lead.",
    });
    expect(problemsOf(index)).toEqual([]);
  });

  it("refuses a metric left out with no entry", () => {
    expectOnlyRemoved((i) => {
      i.removed_metrics = [];
    }, /^metrics must be exactly the eleven of SOW §6\.3, m01 to m11 in order; found 10: .*; m03 is left out with no removed_metrics entry$/);
  });

  it("refuses a second metric left out with no entry", () => {
    expectOnlyRemoved((i) => {
      i.metrics = i.metrics.filter((m: Json) => m.id !== "m05");
    }, /^metrics must be the SOW §6\.3 metrics m01 to m11 in order, less the removed m03; found 9: .*; m05 is left out with no removed_metrics entry$/);
  });

  it("refuses an entry for a metric still in the table", () => {
    const index = base();
    index.removed_metrics = [{ ...ENTRY }];
    expect(index.metrics.map((m: Json) => m.id)).toContain("m03");
    expect(problemsOf(index)).toEqual([
      'removed_metrics[0].id "m03" is still in metrics; a removed metric has no row',
    ]);
  });

  it("refuses the same metric listed twice", () => {
    expectOnlyRemoved((i) => {
      i.removed_metrics.push({ ...ENTRY });
    }, /^removed_metrics\[1\]\.id "m03" is listed twice$/);
  });

  for (const bad of ["m12", "M03", "", undefined]) {
    it(`refuses an id that is not a §6.3 metric: ${JSON.stringify(bad) ?? "missing"}`, () => {
      const index = removed();
      index.removed_metrics[0].id = bad;
      const problems = problemsOf(index);
      expect(problems[0]).toMatch(
        /^removed_metrics\[0\]\.id must be a SOW §6\.3 metric id, m01 to m11, not /,
      );
      // m03 is then left out with no valid entry, and that is said too.
      expect(problems[1]).toMatch(
        /m03 is left out with no removed_metrics entry$/,
      );
      expect(problems).toHaveLength(2);
    });
  }

  it("keeps the metrics in order, less the removed", () => {
    expectOnlyRemoved((i) => {
      i.metrics.reverse();
    }, /^metrics must be the SOW §6\.3 metrics m01 to m11 in order, less the removed m03; found 10: "m11", "m10"/);
  });

  it("must quote the SOW metric verbatim", () => {
    expectOnlyRemoved((i) => {
      i.removed_metrics[0].metric = "Workflows routed to external agents";
    }, /^removed_metrics\[0\]\.metric must quote SOW §6\.3 verbatim for m03: "Workflows routed to external agents & settled on Testnet"/);
  });

  it("must quote the metric, not leave it out", () => {
    expectOnlyRemoved((i) => {
      delete i.removed_metrics[0].metric;
    }, /^removed_metrics\[0\]\.metric must be a non-empty string, not missing$/);
  });

  for (const bad of [undefined, "2026-09-31", "30/09/2026", "today"]) {
    it(`needs a calendar date removed_on, not ${JSON.stringify(bad) ?? "missing"}`, () => {
      expectOnlyRemoved((i) => {
        i.removed_metrics[0].removed_on = bad;
      }, /^removed_metrics\[0\]\.removed_on must be a calendar date like 2026-10-02/);
    });
  }

  it("needs a note", () => {
    expectOnlyRemoved((i) => {
      i.removed_metrics[0].note = " ";
    }, /^removed_metrics\[0\]\.note must be a non-empty string, not " "$/);
  });

  for (const bad of ["Removed.", `${"f".repeat(64)} removed`, "— —"]) {
    it(`needs at least two words of note, not ${JSON.stringify(bad)}`, () => {
      expectOnlyRemoved((i) => {
        i.removed_metrics[0].note = bad;
      }, /^removed_metrics\[0\]\.note must say why in at least two words of plain language/);
    });
  }

  it("refuses an unknown key on an entry", () => {
    expectOnlyRemoved((i) => {
      i.removed_metrics[0].removed_by = "the team lead";
    }, /^removed_metrics\[0\] has an unknown key "removed_by"; allowed: id, metric, removed_on, note$/);
  });

  it("must be an array of objects", () => {
    expectOnlyRemoved((i) => {
      i.removed_metrics = [...i.removed_metrics, "m05"];
    }, /^removed_metrics\[1\] must be an object, not "m05"$/);
    const index = removed();
    index.removed_metrics = { m03: ENTRY };
    const problems = problemsOf(index);
    expect(problems[0]).toBe("removed_metrics must be an array, not an object");
    expect(problems[1]).toMatch(
      /m03 is left out with no removed_metrics entry$/,
    );
    expect(problems).toHaveLength(2);
  });

  it("is testnet only, in its entries too", () => {
    expectOnlyRemoved((i) => {
      i.removed_metrics[0].note =
        "Moved to mainnet: https://stellar.expert/explorer/public/tx/abc.";
    }, /^removed_metrics\[0\]\.note points at the Stellar mainnet/);
  });
});

describe("disclosures", () => {
  for (const id of [
    "testnet",
    "platform_credits",
    "offchain_binding",
    "single_settler_key",
  ]) {
    it(`must include ${id}`, () => {
      expectOnly(
        (i) => {
          i.disclosures = i.disclosures.filter((d: Json) => d.id !== id);
        },
        new RegExp(
          `^disclosures must include testnet, platform_credits, offchain_binding, single_settler_key; missing ${id}$`,
        ),
      );
    });
  }

  it("may add more", () => {
    const index = base();
    index.disclosures.push({ id: "extra", title: "Extra", text: "More." });
    expect(problemsOf(index)).toEqual([]);
  });

  it("needs a title and text, and non-empty optional fields", () => {
    const index = base();
    index.disclosures[0].title = "";
    index.disclosures[0].sow_ref = "";
    expect(problemsOf(index)).toEqual([
      'disclosures[0].title must be a non-empty string, not ""',
      'disclosures[0].sow_ref must be a non-empty string, not ""',
    ]);
  });

  it("must not repeat an id", () => {
    expectOnly((i) => {
      i.disclosures.push({ ...i.disclosures[0] });
    }, /^disclosures\[4\]\.id "testnet" is used twice$/);
  });
});

describe("notes", () => {
  it("must be an array", () => {
    expectOnly((i) => {
      delete i.notes;
    }, /^notes must be an array, not missing$/);
  });

  it("may be empty", () => {
    const index = base();
    index.notes = [];
    expect(problemsOf(index)).toEqual([]);
  });

  it("need a title and text", () => {
    expectOnly((i) => {
      i.notes[0].text = "";
    }, /^notes\[0\]\.text must be a non-empty string/);
  });
});
