import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
} from "@codemirror/view";

const CRITICAL_KEYS = new Set(["input", "minimal_input"]);
const EXPECT_KEYS = new Set([
  "expect",
  "http_status",
  "error_code",
  "validation_target",
  "outcome",
  "error_args",
]);
const IDENTITY_KEYS = new Set(["service_code", "case_id", "rule_id", "rule_type"]);

const KEY_LINE = /^(\s*)([A-Za-z_][\w]*)\s*:/;

function classForKey(key: string): string | null {
  if (CRITICAL_KEYS.has(key)) return "cm-finix-yaml-key-critical";
  if (EXPECT_KEYS.has(key)) return "cm-finix-yaml-key-expect";
  if (IDENTITY_KEYS.has(key)) return "cm-finix-yaml-key-identity";
  return null;
}

function buildDecorations(view: EditorView): DecorationSet {
  const marks: ReturnType<typeof Decoration.mark>[] = [];
  for (const { from, to } of view.visibleRanges) {
    let pos = from;
    while (pos <= to) {
      const line = view.state.doc.lineAt(pos);
      const match = KEY_LINE.exec(line.text);
      if (match) {
        const key = match[2];
        const cls = classForKey(key);
        if (cls) {
          const keyFrom = line.from + match[1].length;
          marks.push(
            Decoration.mark({ class: cls }).range(keyFrom, keyFrom + key.length),
          );
        }
      }
      if (line.number >= view.state.doc.lines) break;
      pos = line.to + 1;
    }
  }
  return Decoration.set(marks, true);
}

export const yamlReviewKeyHighlighter = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
    }

    update(update: { docChanged: boolean; viewportChanged: boolean; view: EditorView }) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = buildDecorations(update.view);
      }
    }
  },
  { decorations: (v) => v.decorations },
);

export const yamlEditorTheme = EditorView.theme({
  "&": {
    fontSize: "12px",
    fontFamily:
      'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
  },
  ".cm-scroller": {
    minHeight: "min(420px, 45vh)",
  },
  ".cm-content": {
    padding: "12px 0",
  },
  ".cm-gutters": {
    backgroundColor: "transparent",
    borderRight: "1px solid var(--border)",
  },
  ".cm-finix-yaml-key-critical": {
    color: "hsl(24 95% 40%)",
    fontWeight: "700",
  },
  ".cm-finix-yaml-key-expect": {
    color: "hsl(221 83% 45%)",
    fontWeight: "600",
  },
  ".cm-finix-yaml-key-identity": {
    color: "hsl(262 55% 42%)",
    fontWeight: "600",
  },
});
