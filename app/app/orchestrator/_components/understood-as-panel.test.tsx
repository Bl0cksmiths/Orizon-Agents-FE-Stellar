// @vitest-environment jsdom
/**
 * "We understood this as…": the brief a plan was built from, shown with the
 * plan and editable, so a buyer can correct it and plan again. Plain DOM
 * checks — this repo does not install jest-dom.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import type { PlanSpec } from "@/lib/types";
import { UnderstoodAsPanel } from "./understood-as-panel";

afterEach(cleanup);

const spec: PlanSpec = {
  goal: "A playable tetris game",
  deliverable: "One HTML file",
  constraints: ["No external libraries"],
  done_criteria: ["Pieces rotate", "Full lines clear"],
  summary: "Build a tetris game as one HTML file.",
};

const heading = () =>
  screen.getByRole("heading", { name: /we understood this as/i });
const field = (name: RegExp) =>
  screen.getByLabelText(name) as HTMLInputElement | HTMLTextAreaElement;
const edit = () =>
  fireEvent.click(screen.getByRole("button", { name: /edit the brief/i }));
const submit = () =>
  fireEvent.click(screen.getByRole("button", { name: /re-plan/i }));

describe("UnderstoodAsPanel — reading", () => {
  it("shows the summary, goal, deliverable and both lists", () => {
    render(<UnderstoodAsPanel spec={spec} />);
    expect(heading()).toBeTruthy();
    const text = document.body.textContent ?? "";
    for (const s of [
      spec.summary,
      spec.goal,
      spec.deliverable,
      "No external libraries",
      "Pieces rotate",
      "Full lines clear",
    ]) {
      expect(text).toContain(s);
    }
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
  });

  it("says an empty list is empty rather than leaving a gap", () => {
    render(
      <UnderstoodAsPanel
        spec={{ ...spec, constraints: [], done_criteria: [] }}
      />,
    );
    expect(document.body.textContent).toMatch(/none stated/i);
  });

  it("offers no edit when nothing can re-plan it", () => {
    render(<UnderstoodAsPanel spec={spec} />);
    expect(
      screen.queryByRole("button", { name: /edit the brief/i }),
    ).toBeNull();
  });
});

describe("UnderstoodAsPanel — editing", () => {
  it("opens a form holding the brief, focused on the goal", () => {
    render(<UnderstoodAsPanel spec={spec} onRespec={() => {}} />);
    edit();
    expect(field(/^goal/i).value).toBe(spec.goal);
    expect(field(/^deliverable/i).value).toBe(spec.deliverable);
    expect(field(/^constraints/i).value).toBe("No external libraries");
    expect(field(/^done when/i).value).toBe("Pieces rotate\nFull lines clear");
    expect(field(/^summary/i).value).toBe(spec.summary);
    expect(document.activeElement).toBe(field(/^goal/i));
  });

  it("re-plans with the edited brief", () => {
    const onRespec = vi.fn();
    render(<UnderstoodAsPanel spec={spec} onRespec={onRespec} />);
    edit();
    fireEvent.change(field(/^constraints/i), {
      target: { value: "No external libraries\n- Works on a phone" },
    });
    submit();
    expect(onRespec).toHaveBeenCalledWith({
      ...spec,
      constraints: ["No external libraries", "Works on a phone"],
    });
  });

  it("names a missing goal beside its field and does not re-plan", () => {
    const onRespec = vi.fn();
    render(<UnderstoodAsPanel spec={spec} onRespec={onRespec} />);
    edit();
    fireEvent.change(field(/^goal/i), { target: { value: "  " } });
    submit();
    expect(onRespec).not.toHaveBeenCalled();
    const goal = field(/^goal/i);
    expect(goal.getAttribute("aria-invalid")).toBe("true");
    const described = (goal.getAttribute("aria-describedby") ?? "")
      .split(" ")
      .map((id) => document.getElementById(id)?.textContent ?? "")
      .join(" ");
    expect(described).toMatch(/goal/i);
    expect(document.activeElement).toBe(goal);
  });

  it("does not spend a planning call on an unchanged brief", () => {
    const onRespec = vi.fn();
    render(<UnderstoodAsPanel spec={spec} onRespec={onRespec} />);
    edit();
    submit();
    expect(onRespec).not.toHaveBeenCalled();
    expect(screen.getByRole("status").textContent).toMatch(/nothing changed/i);
  });

  it("cancels back to the brief, focus on the edit button", () => {
    render(<UnderstoodAsPanel spec={spec} onRespec={() => {}} />);
    edit();
    fireEvent.change(field(/^goal/i), { target: { value: "Something else" } });
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(document.body.textContent).toContain(spec.goal);
    expect(document.body.textContent).not.toContain("Something else");
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: /edit the brief/i }),
    );
  });

  it("holds every control while the plan is being paid for or re-planned", () => {
    const { rerender } = render(
      <UnderstoodAsPanel spec={spec} onRespec={() => {}} busy />,
    );
    const button = screen.getByRole("button", {
      name: /edit the brief/i,
    }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    rerender(<UnderstoodAsPanel spec={spec} onRespec={() => {}} />);
    edit();
    rerender(<UnderstoodAsPanel spec={spec} onRespec={() => {}} busy />);
    expect(
      (screen.getByRole("button", { name: /re-plan/i }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });
});
