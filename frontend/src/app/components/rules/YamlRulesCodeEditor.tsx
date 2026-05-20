import { useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "next-themes";
import CodeMirror from "@uiw/react-codemirror";
import { yaml } from "@codemirror/lang-yaml";
import { githubDark, githubLight } from "@uiw/codemirror-theme-github";
import { EditorView } from "@codemirror/view";
import { cn } from "../ui/utils";
import {
  yamlEditorTheme,
  yamlReviewKeyHighlighter,
} from "./yamlEditorHighlight";

type YamlRulesCodeEditorProps = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  /** Parent must be flex column with flex-1 min-h-0 */
  fillHeight?: boolean;
};

export function YamlRulesCodeEditor({
  value,
  onChange,
  disabled = false,
  className,
  fillHeight = false,
}: YamlRulesCodeEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [editorHeight, setEditorHeight] = useState(360);

  const extensions = useMemo(
    () => [
      yaml(),
      yamlEditorTheme,
      yamlReviewKeyHighlighter,
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
