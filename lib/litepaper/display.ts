/**
 * What the /litepaper page says about the litepaper's files, as plain
 * functions and constants: where the page and its source live, and how a
 * file size is written. Nothing here reads the folder.
 */

import { SITE_URL } from "@/lib/guide/display";
import { LITEPAPER_PATH } from "./paths.mjs";

export { LITEPAPER_PATH };

export const LITEPAPER_URL = `${SITE_URL}${LITEPAPER_PATH}`;

/** Where the litepaper's source and build live: litepaper/ on main. */
export const LITEPAPER_SOURCE_URL =
  "https://github.com/Bl0cksmiths/Orizon-Agents-FE-Stellar/tree/main/litepaper";

const KB = 1024;
const MB = 1024 * KB;

/**
 * A file size as a reader says it: "680 bytes", "84 KB", "2.0 MB". Binary
 * units, as file managers show them; kilobytes are whole, megabytes one
 * decimal, and nothing ever reads "0 KB" or "1024 KB".
 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) {
    throw new RangeError(`not a file size: ${bytes}`);
  }
  if (bytes < KB) return `${bytes} ${bytes === 1 ? "byte" : "bytes"}`;
  const kb = Math.round(bytes / KB);
  if (kb < 1024) return `${kb} KB`;
  return `${(bytes / MB).toFixed(1)} MB`;
}
