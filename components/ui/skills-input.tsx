"use client";

import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent, ChangeEvent } from "react";

import { cn } from "@/lib/utils";
import { focusRing } from "@/lib/ui";

export type SkillsInputProps = {
  /** Controlled list of chips. */
  value: string[];
  onChange: (skills: string[]) => void;
  /** Hard cap on chips; adds past it are rejected, not thrown. */
  max?: number;
  /** Max characters per token; a longer token is refused at entry (matches the
   * on-chain symbol length) rather than entering state and silently failing
   * the page's validation. */
  maxLen?: number;
  /** Wired to the field's <label htmlFor>; lands on the text input. */
  id?: string;
  disabled?: boolean;
  /** Fired when the text input loses focus, so the parent can mark the field
   * touched and reveal any validation note. */
  onBlur?: () => void;
  /** The field's error note — mirrored onto the inner input. */
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
};

/** The charset a skill token may contain — matches the page's normalizeSkills. */
const ALLOWED = /[^A-Za-z0-9_]/g;

/** Strip disallowed characters so nothing bad ever lands in the field. */
function sanitize(s: string): string {
  return s.replace(ALLOWED, "");
}

/**
 * A tag-style input for the register form's skills field.
 *
 * Chips render as the house muted Badge (the same look agents' skills wear in
 * the registry table) with a remove affordance; the text input sits inline so
 * chips + caret read as one control bordered by `border-input`. Following the
 * card's Product Rules, bad characters are rejected on entry rather than
 * silently mangled: typing filters the charset live, and Enter or comma commits
 * the current token. Final lowercasing is the page's `normalizeSkills` job, so
 * casing is preserved here beyond the case-insensitive dedupe.
 *
 * At/over `max` a committed add is dropped and the input is flagged
 * `aria-invalid` for the parent to explain — this component owns no error box.
 */
export function SkillsInput({
  value,
  onChange,
  max = 16,
  maxLen = 32,
  id,
  disabled = false,
  onBlur,
  "aria-describedby": ariaDescribedby,
  "aria-invalid": ariaInvalid,
}: SkillsInputProps) {
  const [input, setInput] = useState("");
  // Set when an add is refused for exceeding `max`; cleared once a chip is
  // removed and there is room again (below), so the flag tracks the live state.
  const [rejected, setRejected] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (value.length < max) setRejected(false);
  }, [value.length, max]);

  /**
   * Commit each raw token in order, applying trim → drop-empty → dedupe
   * (case-insensitive) → max. Emits a single onChange and reports whether the
   * cap was hit so the caller can decide what to keep in the input.
   */
  function addTokens(rawTokens: string[]): { added: number; maxHit: boolean; tooLong: boolean } {
    const next = [...value];
    let maxHit = false;
    let tooLong = false;
    for (const raw of rawTokens) {
      const token = sanitize(raw).trim();
      if (!token) continue;
      if (token.length > maxLen) {
        tooLong = true;
        continue;
      }
      if (next.some((s) => s.toLowerCase() === token.toLowerCase())) continue;
      if (next.length >= max) {
        maxHit = true;
        continue;
      }
      next.push(token);
    }
    const added = next.length - value.length;
    if (added > 0) onChange(next);
    if (maxHit || tooLong) setRejected(true);
    else if (added > 0) setRejected(false);
    return { added, maxHit, tooLong };
  }

  function removeAt(index: number) {
    onChange(value.filter((_, i) => i !== index));
    setRejected(false);
    if (!disabled) inputRef.current?.focus();
  }

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;
    // A pasted string can carry commas; split, commit the complete segments,
    // and keep the trailing (still-being-typed) part in the field.
    if (raw.includes(",")) {
      const segments = raw.split(",");
      const trailing = segments.pop() ?? "";
      addTokens(segments);
      setInput(sanitize(trailing));
      return;
    }
    setInput(sanitize(raw));
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      // Never let the comma reach the value or Enter submit the form.
      e.preventDefault();
      if (!sanitize(input).trim()) return;
      const { maxHit, tooLong } = addTokens([input]);
      // Keep the token visible when it was refused (cap or over-length) so the
      // user can fix it; otherwise the committed/duplicate token is absorbed and
      // the field clears.
      if (!maxHit && !tooLong) setInput("");
      return;
    }
    if (e.key === "Backspace" && input === "" && value.length > 0) {
      e.preventDefault();
      removeAt(value.length - 1);
    }
  }

  const invalid = Boolean(ariaInvalid) || rejected;

  return (
    <div
      className={cn(
        "mt-1.5 flex flex-wrap items-center gap-1.5 border border-input bg-bg/60 p-2 transition focus-within:border-violet",
        disabled && "opacity-50",
      )}
      onClick={() => {
        if (!disabled) inputRef.current?.focus();
      }}
    >
      {value.map((skill, i) => (
        <span
          key={skill}
          className="inline-flex items-center gap-1.5 border border-white/10 bg-white/5 px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-muted"
        >
          {skill}
          <button
            type="button"
            aria-label={`remove ${skill}`}
            disabled={disabled}
            onClick={() => removeAt(i)}
            className={cn(
              "text-muted transition-colors hover:text-magenta disabled:opacity-50",
              focusRing,
            )}
          >
            <span aria-hidden="true">✕</span>
          </button>
        </span>
      ))}
      <input
        ref={inputRef}
        id={id}
        value={input}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={onBlur}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        aria-describedby={ariaDescribedby}
        placeholder={value.length === 0 ? "add a skill" : undefined}
        className={cn(
          "min-w-[8ch] flex-1 border-0 bg-transparent p-1 font-mono text-sm outline-none placeholder:text-muted disabled:opacity-50",
          focusRing,
        )}
      />
    </div>
  );
}
