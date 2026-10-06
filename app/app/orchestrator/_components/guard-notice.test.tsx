// @vitest-environment jsdom
/**
 * The request check's notices on the Orchestrator form: blocked, needs
 * detail, check unavailable, planning paused. Written against what each says
 * and when — plain DOM checks, as this repo does not install jest-dom.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";

import { GUARD_NOTICE_ID, GuardNotice } from "./guard-notice";

afterEach(cleanup);

/** Nothing a buyer reads may be the machine string. */
const RAW = /intent_|planning_paused|\b50\d\b|\b422\b|→/;

const alertText = () => screen.getByRole("alert").textContent ?? "";

describe("GuardNotice — blocked", () => {
  it("says the request cannot be planned, why, and that nothing was charged", () => {
    render(
      <GuardNotice
        refusal={{ kind: "blocked", reason: "It asks for someone's password." }}
      />,
    );
    const text = alertText();
    expect(text).toMatch(/can.t plan this request/i);
    expect(text).toContain("It asks for someone's password.");
    expect(text).toMatch(/nothing was charged/i);
    expect(text).not.toMatch(RAW);
  });

  it("still says it plainly with no reason sent", () => {
    render(<GuardNotice refusal={{ kind: "blocked", reason: null }} />);
    expect(alertText()).toMatch(/safety check/i);
  });

  it("carries the id the intent box is described by", () => {
    render(<GuardNotice refusal={{ kind: "blocked", reason: null }} />);
    expect(screen.getByRole("alert").id).toBe(GUARD_NOTICE_ID);
  });
});

describe("GuardNotice — needs detail", () => {
  it("asks the backend's question and says where to answer it", () => {
    render(
      <GuardNotice
        refusal={{ kind: "needs_detail", question: "What should it do?" }}
      />,
    );
    const text = alertText();
    expect(text).toContain("What should it do?");
    expect(text).toMatch(/add (more )?detail/i);
    expect(text).toMatch(/nothing was charged/i);
  });

  it("asks for a new request when an edited brief changed what was asked", () => {
    render(
      <GuardNotice
        refusal={{
          kind: "needs_detail",
          question:
            "Your edit changes what was asked. Submit it as a new request.",
        }}
        fromBrief
      />,
    );
    const text = alertText();
    expect(text).toMatch(/new request/i);
    expect(text).not.toMatch(/add more detail/i);
  });

  it("asks for detail in its own words with no question sent", () => {
    render(<GuardNotice refusal={{ kind: "needs_detail", question: null }} />);
    expect(alertText()).toMatch(/too short or unclear/i);
  });
});

describe("GuardNotice — check unavailable", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-06T10:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("says the check is down, nothing was planned or charged", () => {
    render(
      <GuardNotice
        refusal={{ kind: "unavailable", retryAfterMs: 20_000 }}
        onRetry={() => {}}
      />,
    );
    const text = alertText();
    expect(text).toMatch(/check/i);
    expect(text).toMatch(/nothing was charged/i);
    expect(text).not.toMatch(RAW);
  });

  it("counts down Retry-After outside the alert, then offers the retry", () => {
    const onRetry = vi.fn();
    render(
      <GuardNotice
        refusal={{ kind: "unavailable", retryAfterMs: 3_000 }}
        onRetry={onRetry}
      />,
    );
    const button = screen.getByRole("button", { name: /try again/i });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    // The tick never rewrites the alert: a live region re-announces on
    // every change, and a second-by-second count would talk over the page.
    const alert = screen.getByRole("alert");
    expect(alert.textContent).not.toMatch(/\d+ s\b/);
    expect(document.body.textContent).toMatch(/3 s/);
    act(() => {
      vi.advanceTimersByTime(3_000);
    });
    expect((button as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(button);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("offers the retry at once when no wait was sent", () => {
    render(
      <GuardNotice
        refusal={{ kind: "unavailable", retryAfterMs: null }}
        onRetry={() => {}}
      />,
    );
    const button = screen.getByRole("button", { name: /try again/i });
    expect((button as HTMLButtonElement).disabled).toBe(false);
  });

  it("holds the retry while a request is already out", () => {
    render(
      <GuardNotice
        refusal={{ kind: "unavailable", retryAfterMs: null }}
        onRetry={() => {}}
        busy
      />,
    );
    const button = screen.getByRole("button", { name: /try again/i });
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("GuardNotice — planning paused", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-06T22:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("says AI planning is paused, when it resumes, and that examples still work", () => {
    render(
      <GuardNotice refusal={{ kind: "paused", retryAfterMs: 2 * 3_600_000 }} />,
    );
    const text = alertText();
    expect(text).toMatch(/paused/i);
    expect(text).toMatch(/nothing was charged/i);
    expect(text).toMatch(/examples/i);
    expect(text).toMatch(/resumes/i);
    // When, as a time in the buyer's own zone — never a bare duration.
    expect(screen.getByRole("alert").querySelector("time")).not.toBeNull();
    expect(text).not.toMatch(RAW);
  });

  it("says it resumes later today when no time was sent", () => {
    render(<GuardNotice refusal={{ kind: "paused", retryAfterMs: null }} />);
    expect(alertText()).toMatch(/resets/i);
    expect(screen.getByRole("alert").querySelector("time")).toBeNull();
  });

  it("has no retry: asking again before it resumes only meets the pause", () => {
    render(
      <GuardNotice
        refusal={{ kind: "paused", retryAfterMs: 60_000 }}
        onRetry={() => {}}
      />,
    );
    expect(screen.queryByRole("button")).toBeNull();
  });
});
