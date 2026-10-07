"use client";

import { Component, type ReactNode } from "react";
import { classifyError } from "@/lib/error-recovery";
import { reportClientError } from "@/lib/report-error";

type Props = {
  /** The part's fixed name, sent with the error report. */
  name: string;
  /** What stands in for the part once it has failed: a static version of
   * it, or nothing for a part the page reads fine without. */
  fallback?: ReactNode;
  children: ReactNode;
};

type State = { failed: boolean };

/**
 * A local error boundary. When the part it wraps throws, in render, in an
 * effect, or because its code would not load, the fallback takes the part's
 * place and the rest of the page carries on.
 *
 * Without one, an error climbs to the route's error screen (app/error.tsx),
 * which replaces the page's content, or from the root layout to
 * app/global-error.tsx, which replaces the whole document, <title> and all.
 * A search engine's renderer that meets either indexes the error screen as
 * the page. So every client-side part of the root layout and of the public
 * pages' shared chrome sits inside one of these (app/layout.test.ts checks
 * the root layout).
 *
 * It does not reload the page for a lost chunk the way the error screens do:
 * the fallback is a working page already, and a reload would cost a crawler
 * the render it came for.
 */
export class Isolate extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error) {
    reportClientError(error, {
      kind: classifyError(error),
      route: window.location.pathname,
      recovery: "isolated",
      part: this.props.name,
    });
  }

  render() {
    if (this.state.failed) return this.props.fallback ?? null;
    return this.props.children;
  }
}
