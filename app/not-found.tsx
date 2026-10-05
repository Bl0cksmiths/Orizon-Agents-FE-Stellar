import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { focusRing } from "@/lib/ui";

/** The 404 page, in the same plain words and layout as the error screens. */
export default function NotFound() {
  return (
    // <main id="main"> keeps the root layout's skip link functional here.
    <main
      id="main"
      className="flex min-h-screen flex-col items-center justify-center px-4 py-16 text-center sm:px-6"
    >
      <div className="w-full max-w-md">
        <h1 className="text-2xl font-semibold tracking-tight text-text sm:text-3xl">
          Page not found
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          There&apos;s nothing at this address. The link may be mistyped, or the
          page may have moved.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-5 sm:flex-row">
          <ButtonLink href="/">Go to the home page</ButtonLink>
          <Link
            href="/app"
            className={`font-mono text-xs uppercase tracking-[0.18em] text-cyan underline decoration-cyan/40 underline-offset-4 transition-colors hover:decoration-cyan ${focusRing}`}
          >
            Open the console
          </Link>
        </div>
      </div>
    </main>
  );
}
