/**
 * Where the litepaper page lives. Its own module, with no Node imports, so
 * the client-side nav can link the page without bundling lib/litepaper/
 * source.mjs and its file-system reads.
 */

export const LITEPAPER_PATH = "/litepaper";
