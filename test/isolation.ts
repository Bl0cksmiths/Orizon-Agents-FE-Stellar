/**
 * Reads a component file's JSX and lists the elements that render outside
 * any <Isolate> (components/isolate.tsx), for the guards that keep a crash
 * in one part from replacing a whole page.
 */
import ts from "typescript";

/** The local boundary's element name. */
const ISOLATE = "Isolate";

/** A JSX element's tag as written: `Nav`, `motion.div`, `main`. */
function tagOf(node: ts.Node): string | null {
  if (ts.isJsxElement(node)) return node.openingElement.tagName.getText();
  if (ts.isJsxSelfClosingElement(node)) return node.tagName.getText();
  return null;
}

/**
 * The tags of every element in `source` for which `counts(tag)` is true and
 * that has no <Isolate> around it. An element inside an Isolate's props
 * (its fallback) counts as inside it.
 */
export function unisolated(
  source: string,
  counts: (tag: string) => boolean,
): string[] {
  const file = ts.createSourceFile(
    "file.tsx",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const found: string[] = [];
  const visit = (node: ts.Node, inside: boolean) => {
    const tag = tagOf(node);
    if (tag === ISOLATE) {
      ts.forEachChild(node, (child) => visit(child, true));
      return;
    }
    if (tag && !inside && counts(tag)) found.push(tag);
    ts.forEachChild(node, (child) => visit(child, inside));
  };
  visit(file, false);
  return found;
}

/** A component, as opposed to an HTML element: a capitalised or dotted tag. */
export const isComponent = (tag: string) => /^[A-Z]|\./.test(tag);
