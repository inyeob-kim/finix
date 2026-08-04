/** Render / parse collection-var generator source (Python) for UI edit. */

export type GeneratorSourceSpec = {
  impl_kind: string;
  impl: Record<string, unknown>;
};

function asInt(v: unknown, fallback: number): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function asStr(v: unknown, fallback: string): string {
  return typeof v === "string" && v.trim() ? v.trim() : fallback;
}

const DATE_OFFSET_HELPERS = `
def _add_months(base: date, months: int) -> date:
    total = base.year * 12 + (base.month - 1) + months
    year, month0 = divmod(total, 12)
    month = month0 + 1
    last = calendar.monthrange(year, month)[1]
    day = min(base.day, last)
    return date(year, month, day)
`.trim();

export function renderGeneratorSource(spec: GeneratorSourceSpec): string {
  const kind = (spec.impl_kind || "").trim().toLowerCase();
  const impl = spec.impl ?? {};

  if (kind === "date_offset") {
    const unit = asStr(impl.unit, "months");
    const n = asInt(impl.n, 0);
    const fmt = asStr(impl.format, "YYYYMMDD").toUpperCase();
    return `"""컬렉션 변수 생성기 — date_offset
실행 시 서버에서 오늘 기준으로 1회 평가됩니다.
아래 설정 값만 수정한 뒤 적용하세요.
"""
from datetime import date, timedelta
import calendar

# --- 설정 ---
UNIT = "${unit}"  # days | months | years
N = ${n}  # 오프셋 (음수 가능)
FORMAT = "${fmt}"  # YYYYMMDD | YYYY-MM-DD
# ------------

${DATE_OFFSET_HELPERS}

def generate() -> str:
    base = date.today()
    if UNIT in ("month", "months"):
        out = _add_months(base, N)
    elif UNIT in ("year", "years"):
        out = _add_months(base, N * 12)
    else:
        out = base + timedelta(days=N)
    if FORMAT == "YYYY-MM-DD":
        return out.strftime("%Y-%m-%d")
    return out.strftime("%Y%m%d")
`;
  }

  if (kind === "random_digits") {
    const length = asInt(impl.length, 10);
    return `"""컬렉션 변수 생성기 — random_digits
실행 시 서버에서 난수 숫자를 1회 생성합니다.
"""
import random

# --- 설정 ---
LENGTH = ${length}  # 1~32
# ------------

def generate() -> str:
    n = max(1, min(32, LENGTH))
    return "".join(str(random.randint(0, 9)) for _ in range(n))
`;
  }

  if (kind === "today_yyyymmdd") {
    return `"""컬렉션 변수 생성기 — today_yyyymmdd
실행 시점의 시스템 날짜(YYYYMMDD).
"""
from datetime import date

def generate() -> str:
    return date.today().strftime("%Y%m%d")
`;
  }

  if (kind === "uuid") {
    return `"""컬렉션 변수 생성기 — uuid
실행마다 새 UUID4.
"""
import uuid

def generate() -> str:
    return str(uuid.uuid4())
`;
  }

  if (kind === "korean_name") {
    return `"""컬렉션 변수 생성기 — korean_name
테스트용 한글 성+이름 (합성).
"""
import random

SURNAMES = ["김", "이", "박", "최", "정", "강", "조", "윤", "장", "임"]
GIVEN = ["민준", "서연", "예준", "서윤", "도윤", "지우", "하준", "서준"]

def generate() -> str:
    return random.choice(SURNAMES) + random.choice(GIVEN)
`;
  }

  if (kind === "korean_rrn") {
    return `"""컬렉션 변수 생성기 — korean_rrn
테스트용 합성 주민번호 (체크디지트 포함).
"""
import random

def _check_digit(body12: str) -> str:
    weights = [2, 3, 4, 5, 6, 7, 8, 9, 2, 3, 4, 5]
    total = sum(int(body12[i]) * weights[i] for i in range(12))
    return str((11 - (total % 11)) % 10)

def generate() -> str:
    yy = random.randint(70, 99)
    mm = random.randint(1, 12)
    dd = random.randint(1, 28)
    sex = random.choice((1, 2))
    region = random.randint(0, 99999)
    body12 = f"{yy:02d}{mm:02d}{dd:02d}{sex}{region:05d}"
    return body12 + _check_digit(body12)
`;
  }

  if (kind === "pick_from_list") {
    const raw = Array.isArray(impl.values) ? impl.values : [];
    const values = raw
      .map((v) => (typeof v === "string" ? v.trim() : String(v ?? "").trim()))
      .filter(Boolean);
    const listLiteral = values
      .map((v) => JSON.stringify(v))
      .join(",\n    ");
    return `"""컬렉션 변수 생성기 — pick_from_list
실행 시 VALUES 중 하나를 랜덤 선택합니다.
목록만 수정하세요.
"""
import random

# --- 설정 ---
VALUES = [
    ${listLiteral || '"sample"'}
]
# ------------

def generate() -> str:
    return random.choice(VALUES)
`;
  }

  return `"""알 수 없는 생성기: ${kind || "(empty)"}
현재 UI에서 소스를 표시할 수 없습니다.
"""
def generate() -> str:
    raise NotImplementedError(${JSON.stringify(kind)})
`;
}

export function isEditableGeneratorKind(kind: string): boolean {
  const k = kind.trim().toLowerCase();
  return (
    k === "date_offset" || k === "random_digits" || k === "pick_from_list"
  );
}

export function parseGeneratorSource(
  source: string,
  fallbackKind: string,
): { ok: true; spec: GeneratorSourceSpec } | { ok: false; error: string } {
  const text = source || "";
  const kindFromDoc = /생성기 — ([a-z0-9_]+)/i.exec(text)?.[1]?.toLowerCase();
  const kind = (kindFromDoc || fallbackKind || "").trim().toLowerCase();

  if (kind === "date_offset") {
    const unit =
      /UNIT\s*=\s*["']([^"']+)["']/.exec(text)?.[1]?.toLowerCase() ?? "months";
    const nRaw = /N\s*=\s*(-?\d+)/.exec(text)?.[1];
    const fmt =
      /FORMAT\s*=\s*["']([^"']+)["']/.exec(text)?.[1]?.toUpperCase() ??
      "YYYYMMDD";
    if (nRaw == null) {
      return { ok: false, error: "소스에서 N = … 설정을 찾지 못했습니다." };
    }
    let unitNorm = "days";
    if (unit.startsWith("month")) unitNorm = "months";
    else if (unit.startsWith("year")) unitNorm = "years";
    const format = fmt === "YYYY-MM-DD" ? "YYYY-MM-DD" : "YYYYMMDD";
    return {
      ok: true,
      spec: {
        impl_kind: "date_offset",
        impl: { unit: unitNorm, n: Number(nRaw), format },
      },
    };
  }

  if (kind === "random_digits") {
    const lengthRaw = /LENGTH\s*=\s*(\d+)/.exec(text)?.[1];
    if (lengthRaw == null) {
      return {
        ok: false,
        error: "소스에서 LENGTH = … 설정을 찾지 못했습니다.",
      };
    }
    return {
      ok: true,
      spec: {
        impl_kind: "random_digits",
        impl: { length: Math.max(1, Math.min(32, Number(lengthRaw))) },
      },
    };
  }

  if (kind === "pick_from_list") {
    const block = /VALUES\s*=\s*\[([\s\S]*?)\]/.exec(text)?.[1];
    if (block == null) {
      return {
        ok: false,
        error: "소스에서 VALUES = […] 설정을 찾지 못했습니다.",
      };
    }
    const values: string[] = [];
    const re = /"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(block)) != null) {
      const raw = m[1] ?? m[2] ?? "";
      try {
        values.push(JSON.parse(`"${raw.replace(/\\'/g, "'")}"`) as string);
      } catch {
        values.push(raw);
      }
    }
    const cleaned = [...new Set(values.map((v) => v.trim()).filter(Boolean))];
    if (cleaned.length < 2) {
      return {
        ok: false,
        error: "VALUES 에 문자열을 2개 이상 넣어 주세요.",
      };
    }
    return {
      ok: true,
      spec: { impl_kind: "pick_from_list", impl: { values: cleaned } },
    };
  }

  if (
    kind === "uuid" ||
    kind === "today_yyyymmdd" ||
    kind === "korean_name" ||
    kind === "korean_rrn"
  ) {
    return { ok: true, spec: { impl_kind: kind, impl: {} } };
  }

  return {
    ok: false,
    error: "이 생성기 종류는 소스 수정이 지원되지 않습니다.",
  };
}
