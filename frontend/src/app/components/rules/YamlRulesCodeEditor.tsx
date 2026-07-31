import { useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "next-themes";
import CodeMirror from "@uiw/react-codemirror";
import { yaml } from "@codemirror/lang-yaml";
import { githubDark, githubLight } from "@uiw/codemirror-theme-github";
import { StateEffect, StateField } from "@codemirror/state";
import { Decoration, EditorView, type DecorationSet } from "@codemirror/view";
import { cn } from "../ui/utils";
import {
  yamlEditorTheme,
  yamlReviewKeyHighlighter,
} from "./yamlEditorHighlight";

const setErrorLineEffect = StateEffect.define<number | null>();

const errorLineField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    let next = deco.map(tr.changes);
    for (const effect of tr.effects) {
      if (!effect.is(setErrorLineEffect)) continue;
      if (effect.value == null || effect.value < 1) {
        next = Decoration.none;
        continue;
      }
      const lineNo = Math.min(effect.value, tr.state.doc.lines);
      const line = tr.state.doc.line(lineNo);
      next = Decoration.set([
        Decoration.line({ class: "cm-yaml-error-line" }).range(line.from),
      ]);
    }
    return next;
  },
  provide: (field) => EditorView.decorations.from(field),
});

type YamlRulesCodeEditorProps = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  /** Parent must be flex column with flex-1 min-h-0 */
  fillHeight?: boolean;
  /** 1-based line to highlight; null clears */
  errorLine?: number | null;
  /** Bump to re-scroll even if line is unchanged */
  errorLineSignal?: number;
};

export function YamlRulesCodeEditor({
  value,
  onChange,
  disabled = false,
  className,
  fillHeight = false,
  errorLine = null,
  errorLineSignal = 0,
}: YamlRulesCodeEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const [editorHeight, setEditorHeight] = useState(360);

  const extensions = useMemo(
    () => [
      yaml(),
      yamlEditorTheme,
      yamlReviewKeyHighlighter,
      errorLineField,
      EditorView.lineWrapping,
      EditorView.editable.of(!disabled),
    ],
    [disabled],
  );

  const { resolvedTheme } = useTheme();
  const editorTheme = resolvedTheme === "dark" ? githubDark : githubLight;

  useEffect(() => {
    if (!fillHeight) return;
    const el = containerRef.current;
    if (!el) return;

    const update = () => {
      const h = Math.floor(el.getBoundingClientRect().height);
      if (h > 120) {
        setEditorHeight(h);
      }
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [fillHeight]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    if (errorLine == null || errorLine < 1) {
      view.dispatch({ effects: setErrorLineEffect.of(null) });
      return;
    }

    const lineNo = Math.min(errorLine, view.state.doc.lines);
    const line = view.state.doc.line(lineNo);
    view.dispatch({
      selection: { anchor: line.from },
      effects: [
        setErrorLineEffect.of(lineNo),
        EditorView.scrollIntoView(line.from, { y: "center" }),
      ],
    });
  }, [errorLine, errorLineSignal, value]);

  const heightProp = fillHeight ? `${editorHeight}px` : "min(420px, 45vh)";

  return (
    <div
      ref={containerRef}
      className={cn(
        "rounded-md border border-border overflow-hidden",
        fillHeight && "flex-1 min-h-0 h-full",
        disabled && "opacity-60 pointer-events-none",
        className,
      )}
    >
      <CodeMirror
        value={value}
        height={heightProp}
        theme={editorTheme}
        extensions={extensions}
        onChange={onChange}
        onCreateEditor={(view) => {
          viewRef.current = view;
          if (errorLine != null && errorLine > 0) {
            const lineNo = Math.min(errorLine, view.state.doc.lines);
            const line = view.state.doc.line(lineNo);
            view.dispatch({
              effects: [
                setErrorLineEffect.of(lineNo),
                EditorView.scrollIntoView(line.from, { y: "center" }),
              ],
            });
          }
        }}
        basicSetup={{
          lineNumbers: true,
          foldGutter: true,
          highlightActiveLine: true,
          bracketMatching: true,
          indentOnInput: true,
        }}
      />
    </div>
  );
}
