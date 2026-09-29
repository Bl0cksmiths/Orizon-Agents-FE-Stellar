/**
 * The documented fixture set: every environment variable a guide sample may
 * read without the guide setting it, and the throwaway values it gets.
 *
 * Offline snippets run with ONLY these variables (plus PATH/HOME/LANG), never
 * the caller's environment, so a snippet cannot pass by reading a real key off
 * the machine that ran the check. The keypair is generated fresh on every run
 * and never funded; nothing signed with it can move anything.
 *
 * Live samples get the same set, minus anything secret (see live.mjs).
 */
import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  randomBytes,
} from "node:crypto";

export const TESTNET_PASSPHRASE = "Test SDF Network ; September 2015";

/**
 * An unsigned testnet TransactionEnvelope (one manage_data op, sequence 2),
 * built with stellar_sdk 13.2.1. Its source account sits at bytes 8-40 (after
 * the envelope type and the muxed-account type), so `fixtureXdr` swaps in the
 * run's own key: a snippet that refuses to sign a transaction whose source is
 * not its key (as the guide's sign_xdr.py does) signs this one.
 */
export const FIXTURE_XDR =
  "AAAAAgAAAAC4fEDa+Atdpl094EygxrBXZvgkwRaoCqeZWUTm60MHiwAAAGQAAAAAAAAAAgAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAACgAAABRvcml6b24tZ3VpZGUtZml4dHVyZQAAAAEAAAAIdW5zaWduZWQAAAAAAAAAAA==";

/** Names whose values are secret: offline only, never sent anywhere. */
export const SECRET_FIXTURES = new Set(["ORIZON_OWNER_SECRET"]);

/** What each fixture variable holds, for the report. */
export const FIXTURE_DOCS = {
  ORIZON_API:
    "the API base: --api on a live run, the guide's own export otherwise",
  ORIZON_NETWORK: "testnet",
  ORIZON_NETWORK_PASSPHRASE: TESTNET_PASSPHRASE,
  ORIZON_OWNER_SECRET:
    "a throwaway ed25519 S... seed, new every run (offline only)",
  ORIZON_OWNER_ADDRESS: "the G... address of that seed",
  ORIZON_AGENT_ID: "guide_check_<8 hex>, a fresh agent id every run",
  ORIZON_ENDPOINT_URL: "https://agent.example.com/orizon",
  ORIZON_CHALLENGE_MESSAGE:
    "orizon-bind:v1:<agent id>:<endpoint url>:<32 hex nonce>",
  ORIZON_UNSIGNED_XDR:
    "an unsigned testnet transaction envelope whose source is ORIZON_OWNER_ADDRESS",
};

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** @param {Uint8Array} bytes */
function base32(bytes) {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

/** CRC16-XModem, as Stellar's strkey checksum. */
function crc16(bytes) {
  let crc = 0;
  for (const byte of bytes) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i += 1) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc;
}

/**
 * @param {number} version  6 << 3 for G (account), 18 << 3 for S (seed)
 * @param {Uint8Array} payload  32 bytes
 */
export function encodeStrkey(version, payload) {
  const body = Buffer.concat([Buffer.from([version]), Buffer.from(payload)]);
  const crc = crc16(body);
  return base32(Buffer.concat([body, Buffer.from([crc & 0xff, crc >> 8])]));
}

const PKCS8_ED25519_PREFIX = Buffer.from(
  "302e020100300506032b657004220420",
  "hex",
);

/**
 * A Stellar keypair from a raw 32-byte ed25519 seed (random when omitted).
 *
 * @param {Uint8Array} [seed]
 */
export function stellarKeypair(seed) {
  let raw = seed === undefined ? undefined : Buffer.from(seed);
  if (raw === undefined) {
    const { privateKey } = generateKeyPairSync("ed25519");
    raw = privateKey.export({ format: "der", type: "pkcs8" }).subarray(-32);
  }
  const privateKey = createPrivateKey({
    key: Buffer.concat([PKCS8_ED25519_PREFIX, raw]),
    format: "der",
    type: "pkcs8",
  });
  const publicRaw = createPublicKey(privateKey)
    .export({ format: "der", type: "spki" })
    .subarray(-32);
  return {
    secret: encodeStrkey(18 << 3, raw),
    publicKey: encodeStrkey(6 << 3, publicRaw),
    publicRaw,
    privateKey,
  };
}

/**
 * FIXTURE_XDR with `publicRaw` (a 32-byte ed25519 key) as its source account.
 *
 * @param {Uint8Array} publicRaw
 */
export function fixtureXdr(publicRaw) {
  const bytes = Buffer.from(FIXTURE_XDR, "base64");
  Buffer.from(publicRaw).copy(bytes, 8);
  return bytes.toString("base64");
}

/**
 * A fresh fixture environment.
 *
 * @param {{ api?: string }} [options]
 * @returns {Record<string, string>}
 */
export function fixtureEnv({ api } = {}) {
  const owner = stellarKeypair();
  const agentId = `guide_check_${randomBytes(4).toString("hex")}`;
  const endpoint = "https://agent.example.com/orizon";
  return {
    ...(api === undefined ? {} : { ORIZON_API: api }),
    ORIZON_NETWORK: "testnet",
    ORIZON_NETWORK_PASSPHRASE: TESTNET_PASSPHRASE,
    ORIZON_OWNER_SECRET: owner.secret,
    ORIZON_OWNER_ADDRESS: owner.publicKey,
    ORIZON_AGENT_ID: agentId,
    ORIZON_ENDPOINT_URL: endpoint,
    ORIZON_CHALLENGE_MESSAGE: `orizon-bind:v1:${agentId}:${endpoint}:${randomBytes(16).toString("hex")}`,
    ORIZON_UNSIGNED_XDR: fixtureXdr(owner.publicRaw),
  };
}
