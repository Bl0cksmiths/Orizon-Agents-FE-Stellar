"use client";
import dynamic from "next/dynamic";
import { useId, useRef, useState, type KeyboardEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ArtifactFile, CodeArtifact } from "@/lib/types";
import { focusRing } from "@/lib/ui";
import { cn } from "@/lib/utils";

// react-syntax-highlighter dominates this route's JS — load it only when
// the files tab actually renders code.
const CodeViewer = dynamic(
  () => import("@/components/ui/code-viewer").then((m) => m.CodeViewer),
  {
    ssr: false,
    loading: () => (
      <div className="animate-pulse rounded-sm border border-border bg-[#060010] px-5 py-4 font-mono text-[10px] uppercase tracking-[0.25em] text-muted">
        loading viewer…
      </div>
    ),
  },
);

type Tab = "preview" | "files";

// Rendered order of the tablist — arrow-key navigation walks this.
const TAB_ORDER: Tab[] = ["preview", "files"];

// Blob MIME per artifact file language; anything unrecognized downloads as
// plain text rather than mislabelled HTML.
const MIME_BY_LANGUAGE: Record<string, string> = {
  html: "text/html",
  css: "text/css",
  javascript: "text/javascript",
  js: "text/javascript",
  json: "application/json",
  svg: "image/svg+xml",
};

/** What a file is shown as. An external operator's files carry no language
 * (the backend drops it), and the code viewer shows those as plain text — the
 * label says so rather than leaving a dangling separator. */
export function fileKind(file: ArtifactFile): string {
  return file.language || "plain text";
}

export function ArtifactViewer({ artifact }: { artifact: CodeArtifact }) {
  const [tab, setTab] = useState<Tab>("preview");
  const [activeFile, setActiveFile] = useState(
    artifact.entry || artifact.files[0]?.path,
  );
  const current =
    artifact.files.find((f) => f.path === activeFile) ?? artifact.files[0];

  // Ids are per-instance so two viewers on one page cannot cross-wire their
  // tabs to each other's panels.
  const uid = useId();
  const tabId: Record<Tab, string> = {
    preview: `${uid}-tab-preview`,
    files: `${uid}-tab-files`,
  };
  const panelId: Record<Tab, string> = {
    preview: `${uid}-panel-preview`,
    files: `${uid}-panel-files`,
  };
  const tabRefs = useRef<Partial<Record<Tab, HTMLButtonElement | null>>>({});

  // Arrow keys move between tabs, Home/End jump to the ends. Selection
  // follows focus — both panels render instantly, so nothing is gained by
  // making it a second keypress.
  const onTabKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    const i = TAB_ORDER.indexOf(tab);
    const next =
      e.key === "ArrowRight"
        ? TAB_ORDER[(i + 1) % TAB_ORDER.length]
        : e.key === "ArrowLeft"
          ? TAB_ORDER[(i - 1 + TAB_ORDER.length) % TAB_ORDER.length]
          : e.key === "Home"
            ? TAB_ORDER[0]
            : e.key === "End"
              ? TAB_ORDER[TAB_ORDER.length - 1]
              : null;
    if (!next) return;
    e.preventDefault();
    setTab(next);
    tabRefs.current[next]?.focus();
  };

  const download = () => {
    const file = current;
    if (!file) return;
    const blob = new Blob([file.content], {
      type:
        (file.language && MIME_BY_LANGUAGE[file.language.toLowerCase()]) ||
        "text/plain",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.path || "artifact.html";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  return (
    <div className="clip-cyber border border-violet/30 bg-surface/60 overflow-hidden">
      <div className="flex items-center justify-between border-b border-border bg-surface/80 px-4 py-2.5 flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <Badge tone="cyan" dot>
            artifact
          </Badge>
          <span className="font-mono text-sm">{artifact.title}</span>
          <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted">
            {artifact.files.length} file{artifact.files.length === 1 ? "" : "s"}{" "}
            · {artifact.files.reduce((n, f) => n + f.content.length, 0)} B
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* The download button sits alongside the tabs but is not one of
              them, so the tablist wraps only the two tabs. */}
          <div
            className="flex items-center gap-2"
            role="tablist"
            aria-label="Artifact views"
          >
            <button
              type="button"
              role="tab"
              id={tabId.preview}
              aria-selected={tab === "preview"}
              aria-controls={panelId.preview}
              // Roving tabIndex: the pair is one tab stop, arrows move inside.
              tabIndex={tab === "preview" ? 0 : -1}
              ref={(el) => {
                tabRefs.current.preview = el;
              }}
              onKeyDown={onTabKeyDown}
              onClick={() => setTab("preview")}
              className={cn(
                "clip-cyber-sm border px-3 py-1 font-mono text-[10px] uppercase tracking-widest transition",
                focusRing,
                tab === "preview"
                  ? "border-violet bg-violet/20 text-text"
                  : "border-border text-muted hover:text-text",
              )}
            >
              preview
            </button>
            <button
              type="button"
              role="tab"
              id={tabId.files}
              aria-selected={tab === "files"}
              aria-controls={panelId.files}
              tabIndex={tab === "files" ? 0 : -1}
              ref={(el) => {
                tabRefs.current.files = el;
              }}
              onKeyDown={onTabKeyDown}
              onClick={() => setTab("files")}
              className={cn(
                "clip-cyber-sm border px-3 py-1 font-mono text-[10px] uppercase tracking-widest transition",
                focusRing,
                tab === "files"
                  ? "border-violet bg-violet/20 text-text"
                  : "border-border text-muted hover:text-text",
              )}
            >
              files
            </button>
          </div>
          <Button size="sm" variant="outline" onClick={download}>
            ↓ download
          </Button>
        </div>
      </div>

      {tab === "preview" ? (
        <div
          role="tabpanel"
          id={panelId.preview}
          aria-labelledby={tabId.preview}
          className="p-4 bg-[#060010]"
        >
          <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted mb-3">
            ◉ sandboxed iframe · no cookies, no parent DOM access
          </p>
          <iframe
            title={artifact.title}
            srcDoc={artifact.preview_html}
            sandbox="allow-scripts"
            // 640px exceeds a 380×667 viewport once the container padding and
            // the header chrome are counted; cap against the viewport instead.
            className="block w-full h-[60vh] md:h-[640px] bg-white rounded-sm border border-border"
          />
        </div>
      ) : (
        <div
          role="tabpanel"
          id={panelId.files}
          aria-labelledby={tabId.files}
          className="flex flex-col md:flex-row"
        >
          {artifact.files.length > 1 && (
            <nav className="md:w-[180px] md:border-r border-border p-3 space-y-1 shrink-0">
              {artifact.files.map((f) => (
                <button
                  key={f.path}
                  onClick={() => setActiveFile(f.path)}
                  className={cn(
                    "w-full text-left px-3 py-1.5 font-mono text-xs truncate transition",
                    focusRing,
                    f.path === activeFile
                      ? "bg-violet/20 text-text border-l-2 border-violet"
                      : "text-muted hover:text-text hover:bg-white/5",
                  )}
                >
                  {f.path}
                </button>
              ))}
            </nav>
          )}
          <div className="flex-1 min-w-0 p-3">
            {current && (
              <>
                <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-cyan mb-2">
                  {current.path} · {fileKind(current)}
                </div>
                <CodeViewer
                  language={current.language}
                  code={current.content}
                  label={`${current.path}, ${fileKind(current)}`}
                />
              </>
            )}
          </div>
        </div>
      )}

      {artifact.summary && (
        <div className="border-t border-border bg-bg/60 px-4 py-3 font-mono text-xs text-muted">
          {artifact.summary}
        </div>
      )}
    </div>
  );
}
