import { useMemo } from "react";
import { useTheme } from "next-themes";
import CodeMirror from "@uiw/react-codemirror";
import { python } from "@codemirror/lang-python";
import { githubDark, githubLight } from "@uiw/codemirror-theme-github";
import { EditorView } from "@codemirror/view";
import { cn } from "../ui/utils";

type Props = {
  value: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
  className?: string;
  height?: string;
};

const editorChrome = EditorView.theme({
  "&": {
    fontSize: "12px",
  },
  ".cm-content": {
    fontFamily:
      'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
    lineHeight: "1.55",
  },
  ".cm-scroller": {
    overflow: "auto",
  },
  "&.cm-focused": {
    outline: "none",
  },
});

export function GeneratorSourceCodeEditor({
  value,
  onChange,
  readOnly = false,
  className,
  height = "240px",
}: Props) {
  const { resolvedTheme } = useTheme();
  const editorTheme = resolvedTheme === "dark" ? githubDark : githubLight;

  const extensions = useMemo(
    () => [
      python(),
      editorChrome,
      EditorView.lineWrapping,
      EditorView.editable.of(!readOnly),
      EditorView.contentAttributes.of({ spellcheck: "false" }),
    ],
    [readOnly],
  );

  return (
    <div
      className={cn(
        "rounded-sm border border-border overflow-hidden bg-background",
        readOnly && "opacity-95",
        className,
      )}
    >
      <CodeMirror
        value={value}
        height={height}
        theme={editorTheme}
        extensions={extensions}
        editable={!readOnly}
        readOnly={readOnly}
        onChange={onChange}
        basicSetup={{
          lineNumbers: true,
          foldGutter: true,
          highlightActiveLine: !readOnly,
          highlightActiveLineGutter: !readOnly,
          bracketMatching: true,
          indentOnInput: !readOnly,
          autocompletion: false,
          searchKeymap: true,
        }}
      />
    </div>
  );
}
