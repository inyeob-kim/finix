export type YamlDiagnostic = {
  summary: string;
  hint?: string;
  line: number | null;
  column: number | null;
  detail: string;
};

function extractLocation(raw: string): {
  line: number | null;
  column: number | null;
} {
  const paren = raw.match(/\((\d+)\s*:\s*(\d+)\)/);
  if (paren) {
    return {
      line: Number.parseInt(paren[1], 10),
      column: Number.parseInt(paren[2], 10),
    };
  }
  const lineCol = raw.match(/line[:\s]+(\d+)[,\s]+column[:\s]+(\d+)/i);
  if (lineCol) {
    return {
      line: Number.parseInt(lineCol[1], 10),
      column: Number.parseInt(lineCol[2], 10),
    };
  }
  const lineOnly = raw.match(/(?:at\s+)?line\s+(\d+)/i);
  if (lineOnly) {
    return { line: Number.parseInt(lineOnly[1], 10), column: null };
  }
  const rulesIdx = raw.match(/rules\[(\d+)\]/);
  if (rulesIdx) {
    return { line: null, column: null };
  }
  return { line: null, column: null };
}

function firstMeaningfulLine(raw: string): string {
  return (
    raw
      .split("\n")
      .map((l) => l.trim())
      .find((l) => l.length > 0 && !/^\d+\s*\|/.test(l)) ?? raw.trim()
  );
}

/**
 * Turn js-yaml / PyYAML / server validation messages into a short UI diagnostic.
 */
export function toYamlDiagnostic(raw: string): YamlDiagnostic {
  const detail = (raw || "").trim() || "알 수 없는 YAML 오류";
  const { line, column } = extractLocation(detail);
  const lower = detail.toLowerCase();
  const head = firstMeaningfulLine(detail);

  if (/rules\[\d+\]/.test(detail) || detail.includes("rule_type")) {
    return {
      summary: head.length > 160 ? `${head.slice(0, 157)}…` : head,
      line,
      column,
      detail,
    };
  }

  if (
    lower.includes("multiline key") ||
    lower.includes("block mapping entry") ||
    lower.includes("implicit key")
  ) {
    return {
      summary: line
        ? `${line}행 들여쓰기·따옴표 문제`
        : "들여쓰기·따옴표 문제",
      hint: "긴 코드/문자열은 | 또는 따옴표로 감싸세요. source_evidence.snippet에 원본 코드가 깨져 들어간 경우가 많습니다.",
      line,
      column,
      detail,
    };
  }

  if (lower.includes("bad indentation") || lower.includes("indent")) {
    return {
      summary: line
        ? `${line}행 들여쓰기가 맞지 않습니다`
        : "들여쓰기가 맞지 않습니다",
      hint: "상위 키와 같은 단계의 필드는 들여쓰기를 맞추세요.",
      line,
      column,
      detail,
    };
  }

  if (lower.includes("duplicate key")) {
    return {
      summary: line ? `${line}행에 중복된 키가 있습니다` : "중복된 키가 있습니다",
      line,
      column,
      detail,
    };
  }

  if (lower.includes("expected a single document") || lower.includes("but found another")) {
    return {
      summary: "문서가 여러 개로 나뉘어 있습니다",
      hint: "--- 구분자를 제거하거나 하나의 YAML 문서로 합치세요.",
      line,
      column,
      detail,
    };
  }

  if (
    lower.includes("yaml") ||
    lower.includes("mapping") ||
    lower.includes("scanning") ||
    lower.includes("parser") ||
    lower.includes("파싱")
  ) {
    return {
      summary: line ? `${line}행 YAML 형식 오류` : "YAML 형식 오류",
      hint: "따옴표·들여쓰기·리스트(-) 문법을 확인하세요.",
      line,
      column,
      detail,
    };
  }

  return {
    summary: head.length > 160 ? `${head.slice(0, 157)}…` : head,
    line,
    column,
    detail,
  };
}
