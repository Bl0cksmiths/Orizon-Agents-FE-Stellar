# Screenshots — evidence manifest (Week 4)

**Status: all 28 public-web shots captured on 2026-10-03, 15:47–16:08 PHT
(07:47–08:08 UTC).** Every frame is a PNG of a public page taken by Playwright
Chromium in a 1440×900 viewport, and every PNG was opened and looked at by eye
after capture. Each row below carries the source URL so a reviewer can check the
same page live. Pixel sizes, crop offsets and byte sizes come from
[`capture-meta.json`](./capture-meta.json), which the capture script writes.

**No wallet was connected. Nothing was signed, authorized, paid or submitted.**
Every request the script makes is a GET.

**Every frame is of the live deployment or a public page.** Unlike Week 3, no
frame in this folder is a local run against test fixtures: with escrow v2 live,
everything this bundle shows could be captured from the real service.

**Cropping.** Where a page runs for thousands of pixels beyond the panel that is
the evidence, the full-page shot is clipped and the row says where. Nothing is
cut from the middle of a frame, and no crop removes a caveat. Frame 12 hides two
columns of a long table in the browser, and says so in its own first line. Every
frame is re-encoded with a 256-colour adaptive palette (no dithering, no
resizing), so pixel positions are unchanged and text is legible at 1:1.
