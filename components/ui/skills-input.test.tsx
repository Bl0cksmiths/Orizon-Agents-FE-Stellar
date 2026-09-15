// @vitest-environment jsdom
/**
 * Unit tests for SkillsInput.
 *
 * The field is the register form's one free-text list, so it has to reject bad
 * input at the door rather than mangle it later: the charset is filtered as the
 * user types, Enter or comma commits a token, duplicates fold away, and the cap
 * refuses a further add by flagging aria-invalid instead of throwing. Each of
 * those guards is exercised here against an onChange spy so the emitted arrays
 * are checked exactly.
 *
 * Assertions are plain DOM checks — this repo does not install jest-dom.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { SkillsInput } from "./skills-input";

afterEach(cleanup);

/** The lone text input the control exposes. */
function getInput(): HTMLInputElement {
  return screen.getByRole("textbox") as HTMLInputElement;
}

describe("SkillsInput", () => {
  it("commits the typed token as a chip on Enter", () => {
    const onChange = vi.fn();
    render(<SkillsInput value={[]} onChange={onChange} />);

    const input = getInput();
    fireEvent.change(input, { target: { value: "rust" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onChange).toHaveBeenCalledWith(["rust"]);
  });

  it("commits the token on comma without letting the comma into the value", () => {
    const onChange = vi.fn();
    render(<SkillsInput value={[]} onChange={onChange} />);

    const input = getInput();
    fireEvent.change(input, { target: { value: "solidity" } });
    fireEvent.keyDown(input, { key: "," });

    expect(onChange).toHaveBeenCalledWith(["solidity"]);
    // The comma keydown is prevented, so nothing with a comma is ever emitted.
    expect(onChange).not.toHaveBeenCalledWith(expect.arrayContaining([","]));
  });

  it("splits a pasted comma list into separate chips", () => {
    const onChange = vi.fn();
    render(<SkillsInput value={[]} onChange={onChange} />);

    // The trailing segment stays in the input; the complete ones commit.
    fireEvent.change(getInput(), { target: { value: "rust,go, typescript" } });

    expect(onChange).toHaveBeenCalledWith(["rust", "go"]);
    expect(getInput().value).toBe("typescript");
  });

  it("filters disallowed characters as they are typed", () => {
    const onChange = vi.fn();
    render(<SkillsInput value={[]} onChange={onChange} />);

    const input = getInput();
    fireEvent.change(input, { target: { value: "c++ dev!" } });

    // Spaces, '+' and '!' are not in [A-Za-z0-9_], so they never land.
    expect(input.value).toBe("cdev");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("preserves case on entry (lowercasing is the page's job)", () => {
    const onChange = vi.fn();
    render(<SkillsInput value={[]} onChange={onChange} />);

    const input = getInput();
    fireEvent.change(input, { target: { value: "Rust" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onChange).toHaveBeenCalledWith(["Rust"]);
  });

  it("rejects a case-insensitive duplicate", () => {
    const onChange = vi.fn();
    render(<SkillsInput value={["rust"]} onChange={onChange} />);

    const input = getInput();
    fireEvent.change(input, { target: { value: "RUST" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onChange).not.toHaveBeenCalled();
    // The duplicate is absorbed: the field clears rather than keeping the token.
    expect(input.value).toBe("");
  });

  it("removes the last chip on Backspace when the input is empty", () => {
    const onChange = vi.fn();
    render(<SkillsInput value={["rust", "go"]} onChange={onChange} />);

    fireEvent.keyDown(getInput(), { key: "Backspace" });

    expect(onChange).toHaveBeenCalledWith(["rust"]);
  });

  it("does not remove a chip on Backspace while the input has text", () => {
    const onChange = vi.fn();
    render(<SkillsInput value={["rust"]} onChange={onChange} />);

    const input = getInput();
    fireEvent.change(input, { target: { value: "g" } });
    fireEvent.keyDown(input, { key: "Backspace" });

    expect(onChange).not.toHaveBeenCalled();
  });

  it("removes a chip when its ✕ is clicked, emitting the array without it", () => {
    const onChange = vi.fn();
    render(<SkillsInput value={["rust", "go", "ts"]} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "remove go" }));

    expect(onChange).toHaveBeenCalledWith(["rust", "ts"]);
  });

  it("rejects the add past max and flags the input aria-invalid", () => {
    const full = Array.from({ length: 16 }, (_, i) => `skill${i}`);
    const onChange = vi.fn();
    render(<SkillsInput value={full} onChange={onChange} max={16} />);

    const input = getInput();
    fireEvent.change(input, { target: { value: "extra" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onChange).not.toHaveBeenCalled();
    expect(input.getAttribute("aria-invalid")).toBe("true");
    // The refused token stays visible so the user can retry after removing one.
    expect(input.value).toBe("extra");
  });

  it("refuses a token longer than maxLen, flags aria-invalid and keeps it visible", () => {
    const onChange = vi.fn();
    render(<SkillsInput value={[]} onChange={onChange} maxLen={32} />);

    const input = getInput();
    const tooLong = "a".repeat(33);
    fireEvent.change(input, { target: { value: tooLong } });
    fireEvent.keyDown(input, { key: "Enter" });

    // The over-length token never enters state, so it can never silently fail
    // the page's validation and disable submit with no message.
    expect(onChange).not.toHaveBeenCalled();
    expect(input.getAttribute("aria-invalid")).toBe("true");
    // Kept visible so the user can shorten it rather than losing it.
    expect(input.value).toBe(tooLong);
  });

  it("honours an aria-invalid passed by the parent", () => {
    render(<SkillsInput value={[]} onChange={vi.fn()} aria-invalid />);
    expect(getInput().getAttribute("aria-invalid")).toBe("true");
  });

  it("blocks typing, committing and removing while disabled", () => {
    const onChange = vi.fn();
    render(<SkillsInput value={["rust"]} onChange={onChange} disabled />);

    const input = getInput();
    expect(input.disabled).toBe(true);

    // A disabled remove button does not fire onClick.
    const remove = screen.getByRole("button", {
      name: "remove rust",
    }) as HTMLButtonElement;
    expect(remove.disabled).toBe(true);
    fireEvent.click(remove);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("associates the label via the id and forwards aria-describedby", () => {
    render(
      <SkillsInput
        value={[]}
        onChange={vi.fn()}
        id="agent-skills"
        aria-describedby="skills-error"
      />,
    );

    const input = getInput();
    expect(input.id).toBe("agent-skills");
    expect(input.getAttribute("aria-describedby")).toBe("skills-error");
  });
});
