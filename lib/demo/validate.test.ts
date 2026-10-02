/**
 * Unit tests for lib/demo/validate.mjs: every rule the demo manifest is held
 * to at build. Each test starts from a manifest that passes and breaks one
 * thing, so a failure names the rule that let it through.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  MAX_DURATION_SECONDS,
  MIN_DURATION_SECONDS,
  testnetTxUrl,
  validateDemoManifest,
} from "./validate.mjs";

const hash = (c: string) => c.repeat(64);

function item(kind: string, c: string, deliverable = "D3") {
  return {
    label: `A ${kind} transaction`,
    deliverable,
    kind,
    tx_hash: hash(c),
    explorer: testnetTxUrl(hash(c)),
    verified: true,
  };
}

type Part = Record<string, unknown> & {
  chapters: Record<string, unknown>[];
};
type Manifest = Record<string, unknown> & {
  parts: Part[];
  evidence: Record<string, unknown> & { items: Record<string, unknown>[] };
};

function published(): Manifest {
  return {
    status: "published",
    parts: [
      {
        role: "operator",
        provider: "youtube",
        id: "abcDEF12_-x",
        title: "Registering an agent",
        duration_seconds: 150,
        published_at: "2026-10-02",
        recorded_on_earlier_console: null,
        chapters: [
          { t: 0, title: "Intro", deliverable: null },
          { t: 20, title: "Register", deliverable: "D1" },
        ],
        transcript_file: "content/demo/operator.md",
        captions_file: "public/demo/operator.en.vtt",
      },
      {
        role: "buyer",
        provider: "youtube",
        id: "zyxWVU98-_q",
        title: "Buying a workflow",
        duration_seconds: 90,
        published_at: "2026-07-24",
        recorded_on_earlier_console: "2026-07-24",
        chapters: [
          { t: 0, title: "Connect", deliverable: null },
          { t: 30, title: "Pay", deliverable: "D4" },
        ],
        transcript_file: "content/demo/buyer.md",
        captions_file: "public/demo/buyer.en.vtt",
      },
    ],
    evidence: {
      generated_at: 1790000000,
      network: "testnet",
      items: [
        item("register", "a", "D1"),
        item("settle", "b", "D4"),
        item("dispute_rating", "c"),
        item("refund", "d"),
      ],
    },
  };
}

const unpublished = () => ({
  status: "unpublished",
  parts: [],
  evidence: { generated_at: null, network: "testnet", items: [] },
});

let root: string;
let options: { root: string; contentDir: string; publicDir: string };

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "demo-"));
  mkdirSync(path.join(root, "content/demo"), { recursive: true });
  mkdirSync(path.join(root, "public/demo"), { recursive: true });
  for (const role of ["operator", "buyer"]) {
    writeFileSync(path.join(root, `content/demo/${role}.md`), "Hello.\n");
    writeFileSync(
      path.join(root, `public/demo/${role}.en.vtt`),
      "WEBVTT\n\n00:00.000 --> 00:02.000\nHello.\n",
    );
  }
  options = {
    root,
    contentDir: path.join(root, "content/demo"),
    publicDir: path.join(root, "public"),
  };
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const problems = (raw: unknown) => validateDemoManifest(raw, options).problems;

describe("a manifest that passes", () => {
  it("accepts the committed unpublished shape", () => {
    expect(problems(unpublished())).toEqual([]);
  });

  it("accepts a complete published manifest and resolves each part's files, in order", () => {
    const result = validateDemoManifest(published(), options);
    expect(result.problems).toEqual([]);
    expect(result.parts).toEqual([
      {
        transcriptPath: path.join(root, "content/demo/operator.md"),
        captionsPath: path.join(root, "public/demo/operator.en.vtt"),
      },
      {
        transcriptPath: path.join(root, "content/demo/buyer.md"),
        captionsPath: path.join(root, "public/demo/buyer.en.vtt"),
      },
    ]);
  });

  it("accepts a plain-text transcript", () => {
    writeFileSync(path.join(root, "content/demo/narration.txt"), "Hi.\n");
    const m = published();
    m.parts[0].transcript_file = "content/demo/narration.txt";
    expect(problems(m)).toEqual([]);
  });

  it("accepts the buyer first: the order is the author's", () => {
    const m = published();
    m.parts.reverse();
    expect(problems(m)).toEqual([]);
  });
});

describe("status", () => {
  it("must be unpublished or published", () => {
    expect(problems({ ...unpublished(), status: "draft" })).toEqual([
      'status must be "unpublished" or "published", not "draft"',
    ]);
    expect(problems([])).toEqual([
      "the manifest must be a JSON object, not an array",
    ]);
  });

  it("rejects an unknown key anywhere in the contract", () => {
    const m = published();
    m.video = {};
    m.parts[0].length = 1;
    m.parts[1].chapters[0].start = 0;
    m.evidence.items[0].url = "x";
    expect(problems(m)).toEqual([
      expect.stringContaining('the manifest has an unknown key "video"'),
      expect.stringContaining('parts[0] has an unknown key "length"'),
      expect.stringContaining(
        'parts[1].chapters[0] has an unknown key "start"',
      ),
      expect.stringContaining('evidence.items[0] has an unknown key "url"'),
    ]);
  });
});

describe("while unpublished nothing may be shown as real", () => {
  it("rejects a part", () => {
    const m = { ...unpublished(), parts: published().parts };
    expect(problems(m)).toEqual([
      "parts must be empty while the demo is unpublished; it has 2. Publish a part only once it is uploaded",
    ]);
  });

  it("requires the parts list itself", () => {
    const m: Record<string, unknown> = unpublished();
    delete m.parts;
    expect(problems(m)).toEqual([
      "parts must be an empty array while the demo is unpublished, not missing",
    ]);
  });

  it("rejects evidence", () => {
    const m = unpublished();
    m.evidence.items = [item("settle", "b")] as never[];
    expect(problems(m)).toEqual([
      expect.stringMatching(
        /^evidence\.items must be empty while the demo is unpublished; it has 1/,
      ),
    ]);
  });

  it("still requires the testnet network", () => {
    const m = unpublished();
    m.evidence.network = "public";
    expect(problems(m)).toEqual([
      'evidence.network must be "testnet"; the demo is testnet only, not "public"',
    ]);
  });
});

describe("duration (acceptance criterion 1: 3 to 5 minutes, the parts together)", () => {
  it.each([MIN_DURATION_SECONDS, MAX_DURATION_SECONDS])(
    "accepts %i s together",
    (seconds) => {
      const m = published();
      m.parts[0].duration_seconds = seconds - 90;
      expect(problems(m)).toEqual([]);
    },
  );

  it("accepts the published demo's 189 s and 71 s", () => {
    const m = published();
    m.parts[0].duration_seconds = 189;
    m.parts[1].duration_seconds = 71;
    expect(problems(m)).toEqual([]);
  });

  it.each([179, 301])("rejects %i s together", (seconds) => {
    const m = published();
    m.parts[0].duration_seconds = seconds - 90;
    expect(problems(m)).toEqual([
      `the parts run ${seconds} s together; the demo must run 3 to 5 minutes (180–300 s inclusive)`,
    ]);
  });

  it("holds no single part to 3 to 5 minutes", () => {
    const m = published();
    m.parts[0].duration_seconds = 170;
    m.parts[1].duration_seconds = 31;
    expect(problems(m)).toEqual([]);
  });

  it("rejects a fractional, zero or missing duration, and adds up nothing it cannot", () => {
    const m = published();
    m.parts[0].duration_seconds = 150.5;
    delete m.parts[1].duration_seconds;
    expect(problems(m)).toEqual([
      "parts[0].duration_seconds must be a whole number of seconds above 0, not 150.5 (number)",
      "parts[1].duration_seconds must be a whole number of seconds above 0, not missing",
    ]);
  });
});

describe("parts", () => {
  it("must be a non-empty list once published", () => {
    const m = published();
    m.parts = [];
    expect(problems(m)).toEqual([
      "parts must list at least one part when published",
    ]);
    expect(problems({ ...published(), parts: {} })).toEqual([
      "parts must be an array, not an object",
    ]);
  });

  it("must show both the operator's side and the buyer's", () => {
    const m = published();
    m.parts[1].role = "operator";
    expect(problems(m)).toEqual([
      "parts must show both the operator's side and the buyer's; none has the role buyer",
    ]);
  });

  it("rejects an unknown role", () => {
    const m = published();
    m.parts[1].role = "viewer";
    expect(problems(m)).toEqual([
      'parts[1].role must be one of operator, buyer, not "viewer"',
      "parts must show both the operator's side and the buyer's; none has the role buyer",
    ]);
  });

  it("must each be their own video", () => {
    const m = published();
    m.parts[1].id = m.parts[0].id;
    expect(problems(m)).toEqual([
      'parts[1].id "abcDEF12_-x" is the same video as parts[0]; each part is its own video',
    ]);
  });

  it.each(["abc", "abcDEF12_-xy", "abcDEF12_-!", ""])(
    "rejects the id %j",
    (id) => {
      const m = published();
      m.parts[0].id = id;
      expect(problems(m)).toEqual([
        `parts[0].id must be an 11-character YouTube id (letters, digits, - and _), not ${JSON.stringify(id)}`,
      ]);
    },
  );

  it("rejects another provider, a blank title and an impossible date", () => {
    const m = published();
    m.parts[0].provider = "vimeo";
    m.parts[0].title = " ";
    m.parts[0].published_at = "2026-02-30";
    expect(problems(m)).toEqual([
      'parts[0].provider must be "youtube", not "vimeo"',
      'parts[0].title must be a non-empty string, not " "',
      'parts[0].published_at must be a calendar date like 2026-10-02, not "2026-02-30"',
    ]);
  });

  it("rejects a part that is not an object", () => {
    const m = published();
    (m.parts as unknown[])[1] = "buyer";
    expect(problems(m)).toEqual([
      'parts[1] must be an object, not "buyer"',
      "parts must show both the operator's side and the buyer's; none has the role buyer",
    ]);
  });
});

describe("a part recorded on an earlier console", () => {
  it("must say so with null or the day it was recorded", () => {
    const m = published();
    m.parts[1].recorded_on_earlier_console = true;
    delete m.parts[0].recorded_on_earlier_console;
    expect(problems(m)).toEqual([
      "parts[0].recorded_on_earlier_console must be null (it shows the console as it is now) or the calendar date it was recorded, not missing",
      "parts[1].recorded_on_earlier_console must be null (it shows the console as it is now) or the calendar date it was recorded, not true (boolean)",
    ]);
  });

  it("cannot have been recorded after it was published", () => {
    const m = published();
    m.parts[1].recorded_on_earlier_console = "2026-07-25";
    expect(problems(m)).toEqual([
      "parts[1].recorded_on_earlier_console is 2026-07-25, after the part was published on 2026-07-24",
    ]);
  });
});

describe("chapters", () => {
  it("must start at 0", () => {
    const m = published();
    m.parts[0].chapters[0].t = 5;
    expect(problems(m)).toEqual([
      "parts[0].chapters must start at 0; the first starts at 5",
    ]);
  });

  it("must ascend strictly", () => {
    const m = published();
    m.parts[0].chapters[1].t = 0;
    expect(problems(m)).toEqual([
      "parts[0].chapters[1].t is 0, not after the chapter before it (0); chapters must be in ascending order",
    ]);
  });

  it("must sit inside their own part, not the demo as a whole", () => {
    const m = published();
    // 100 s is inside the 240 s demo, but past the end of the 90 s buyer part.
    m.parts[1].chapters[1].t = 100;
    expect(problems(m)).toEqual([
      "parts[1].chapters[1].t is 100, at or past the end of its 90 s part",
    ]);
  });

  it("must carry a known tag", () => {
    const m = published();
    m.parts[0].chapters[1].deliverable = "D5";
    expect(problems(m)).toEqual([
      'parts[0].chapters[1].deliverable must be one of D1, D2, D3, D4, or null when the chapter shows none of them, not "D5"',
    ]);
  });

  it("rejects the old all-four tag, which no one chapter shows", () => {
    const m = published();
    m.parts[0].chapters[0].deliverable = "all";
    expect(problems(m)).toEqual([
      'parts[0].chapters[0].deliverable must be one of D1, D2, D3, D4, or null when the chapter shows none of them, not "all"',
    ]);
  });

  it("need not tag every deliverable: one the videos do not show stays untagged", () => {
    // The fixture tags only D1 and D4; D2 and D3 have no chapter.
    expect(problems(published())).toEqual([]);
  });

  it("must not be empty in a part", () => {
    const m = published();
    m.parts[1].chapters = [];
    expect(problems(m)).toEqual([
      "parts[1].chapters must list at least one chapter",
    ]);
  });
});

describe("evidence", () => {
  it.each(["settle", "dispute_rating", "refund"])(
    "requires at least one %s item (acceptance criterion 3)",
    (kind) => {
      const m = published();
      m.evidence.items = m.evidence.items.filter((i) => i.kind !== kind);
      expect(problems(m)).toEqual([
        `evidence.items must include at least one of each of settle, dispute_rating, refund; missing ${kind}`,
      ]);
    },
  );

  it.each([
    ["uppercase", "A".repeat(64)],
    ["short", "a".repeat(63)],
    ["non-hex", "g".repeat(64)],
  ])("rejects a %s hash", (_, bad) => {
    const m = published();
    m.evidence.items[1].tx_hash = bad;
    expect(problems(m)).toEqual([
      `evidence.items[1].tx_hash must be 64 lowercase hex characters, not "${bad}"`,
    ]);
  });

  it("rejects a mainnet explorer link", () => {
    const m = published();
    m.evidence.items[1].explorer = `https://stellar.expert/explorer/public/tx/${hash("b")}`;
    expect(problems(m)).toEqual([
      `evidence.items[1].explorer must be exactly ${testnetTxUrl(hash("b"))}, not "https://stellar.expert/explorer/public/tx/${hash("b")}"`,
    ]);
  });

  it("rejects a link to a different transaction", () => {
    const m = published();
    m.evidence.items[1].explorer = testnetTxUrl(hash("c"));
    expect(problems(m)).toEqual([
      expect.stringMatching(/^evidence\.items\[1\]\.explorer must be exactly/),
    ]);
  });

  it("rejects an item that was not re-read on the network", () => {
    const m = published();
    m.evidence.items[2].verified = false;
    expect(problems(m)).toEqual([
      "evidence.items[2].verified must be true (re-read on the network), not false (boolean)",
    ]);
  });

  it("rejects a mainnet run, an unknown kind or deliverable and a missing time", () => {
    const m = published();
    m.evidence.network = "mainnet";
    m.evidence.generated_at = null;
    m.evidence.items.push({
      ...item("other", "e"),
      kind: "mint",
      deliverable: "D9",
    });
    expect(problems(m)).toEqual([
      'evidence.network must be "testnet"; the demo is testnet only, not "mainnet"',
      "evidence.generated_at must be the evidence run's Unix time in seconds, not null",
      'evidence.items[4].deliverable must be one of D1, D2, D3, D4, not "D9"',
      'evidence.items[4].kind must be one of register, authorize, settle, seal, rating, dispute_rating, refund, other, not "mint"',
    ]);
  });

  it("rejects an empty evidence list once published", () => {
    const m = published();
    m.evidence.items = [];
    expect(problems(m)).toEqual([
      "evidence.items must not be empty when published",
      "evidence.items must include at least one of each of settle, dispute_rating, refund; missing settle, dispute_rating, refund",
    ]);
  });
});

describe("each part's transcript and captions", () => {
  it("must exist", () => {
    rmSync(path.join(root, "content/demo/buyer.md"));
    rmSync(path.join(root, "public/demo/buyer.en.vtt"));
    expect(problems(published())).toEqual([
      'parts[1].transcript_file names "content/demo/buyer.md", which does not exist',
      'parts[1].captions_file names "public/demo/buyer.en.vtt", which does not exist',
    ]);
  });

  it("must be named", () => {
    const m = published();
    m.parts[0].transcript_file = null;
    m.parts[0].captions_file = null;
    expect(problems(m)).toEqual([
      "parts[0].transcript_file must name a file, not null",
      "parts[0].captions_file must name a file, not null",
    ]);
  });

  it("must not be shared between parts", () => {
    const m = published();
    m.parts[1].transcript_file = m.parts[0].transcript_file;
    m.parts[1].captions_file = m.parts[0].captions_file;
    expect(problems(m)).toEqual([
      "parts[1].transcript_file is the same file as parts[0].transcript_file; each part has its own",
      "parts[1].captions_file is the same file as parts[0].captions_file; each part has its own",
    ]);
  });

  it("must stay in their directories", () => {
    writeFileSync(path.join(root, "notes.md"), "x");
    const m = published();
    m.parts[0].transcript_file = "content/demo/../../notes.md";
    m.parts[0].captions_file = "content/demo/operator.md";
    expect(problems(m)).toEqual([
      'parts[0].transcript_file must be a file under content/demo/, not "content/demo/../../notes.md"',
      'parts[0].captions_file must be a file under public/demo/, not "content/demo/operator.md"',
    ]);
  });

  it("must have the right type", () => {
    writeFileSync(path.join(root, "content/demo/operator.html"), "<p>x</p>");
    writeFileSync(path.join(root, "public/demo/operator.srt"), "1\n");
    writeFileSync(
      path.join(root, "public/demo/fake.vtt"),
      "1\n00:00 --> 00:01\n",
    );
    const m = published();
    m.parts[0].transcript_file = "content/demo/operator.html";
    m.parts[0].captions_file = "public/demo/operator.srt";
    expect(problems(m)).toEqual([
      'parts[0].transcript_file must end in .md or .txt, not "content/demo/operator.html"',
      'parts[0].captions_file must end in .vtt, not "public/demo/operator.srt"',
    ]);
    m.parts[0].transcript_file = "content/demo/operator.md";
    m.parts[0].captions_file = "public/demo/fake.vtt";
    const result = validateDemoManifest(m, options);
    expect(result.problems).toEqual([
      'parts[0].captions_file names "public/demo/fake.vtt", which is not WebVTT (it must start with "WEBVTT")',
    ]);
    expect(result.parts[0].captionsPath).toBeNull();
  });

  it("rejects an absolute path and an empty file", () => {
    writeFileSync(path.join(root, "content/demo/operator.md"), "  \n");
    const m = published();
    m.parts[0].captions_file = path.join(root, "public/demo/operator.en.vtt");
    expect(problems(m)).toEqual([
      'parts[0].transcript_file names "content/demo/operator.md", which is empty',
      `parts[0].captions_file must be a repository-relative path, not ${JSON.stringify(m.parts[0].captions_file)}`,
    ]);
  });
});

describe("reporting", () => {
  it("lists every problem at once, not just the first", () => {
    const m = published();
    m.parts[0].duration_seconds = 211;
    m.evidence.items[1].tx_hash = "nope";
    m.evidence.items = m.evidence.items.filter((i) => i.kind !== "refund");
    expect(problems(m)).toHaveLength(3);
  });
});
