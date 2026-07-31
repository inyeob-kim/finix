/** Built-in collection-variable generators (keep in sync with backend). */

export type CollectionVarGeneratorId =
  | "today_yyyymmdd"
  | "uuid"
  | "random_digits"
  | "korean_name"
  | "korean_rrn";

export type CollectionVarGeneratorOption = {
  id: CollectionVarGeneratorId;
  label: string;
  hint: string;
};

export const COLLECTION_VAR_GENERATORS: readonly CollectionVarGeneratorOption[] =
  [
    {
      id: "today_yyyymmdd",
      label: "오늘 날짜",
      hint: "YYYYMMDD · 실행 시점 시스템 날짜",
    },
    {
      id: "uuid",
      label: "UUID",
      hint: "실행마다 새 UUID",
    },
    {
      id: "random_digits",
      label: "난수 숫자",
      hint: "10자리 숫자",
    },
    {
      id: "korean_name",
      label: "한글 이름",
      hint: "테스트용 성+이름",
    },
    {
      id: "korean_rrn",
      label: "주민번호",
      hint: "테스트용 합성 주민번호",
    },
  ] as const;

const GENERATOR_ID_SET = new Set<string>(
  COLLECTION_VAR_GENERATORS.map((g) => g.id),
);

const SURNAMES = [
  "김",
  "이",
  "박",
  "최",
  "정",
  "강",
  "조",
  "윤",
  "장",
  "임",
  "한",
  "오",
  "서",
  "신",
  "권",
  "황",
  "안",
  "송",
  "전",
  "홍",
] as const;

const GIVEN = [
  "민준",
  "서연",
  "예준",
  "서윤",
  "도윤",
  "지우",
  "하준",
  "서준",
  "주원",
  "지민",
  "수아",
  "하은",
  "지아",
  "유진",
  "예은",
  "시우",
  "준서",
  "현우",
  "지훈",
  "수빈",
] as const;

function todayYyyymmdd(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)]!;
}

function randomDigits(length = 10): string {
  const n = Math.max(1, Math.min(32, length));
  let out = "";
  for (let i = 0; i < n; i++) out += String(Math.floor(Math.random() * 10));
  return out;
}

function rrnCheckDigit(body12: string): string {
  const weights = [2, 3, 4, 5, 6, 7, 8, 9, 2, 3, 4, 5];
  let total = 0;
  for (let i = 0; i < 12; i++) {
    total += Number(body12[i]) * weights[i]!;
  }
  return String((11 - (total % 11)) % 10);
}

function koreanRrn(): string {
  const yy = 70 + Math.floor(Math.random() * 30);
  const mm = 1 + Math.floor(Math.random() * 12);
  const dd = 1 + Math.floor(Math.random() * 28);
  const sex = Math.random() < 0.5 ? 1 : 2;
  const region = Math.floor(Math.random() * 100000);
  const body12 =
    String(yy).padStart(2, "0") +
    String(mm).padStart(2, "0") +
    String(dd).padStart(2, "0") +
    String(sex) +
    String(region).padStart(5, "0");
  return body12 + rrnCheckDigit(body12);
}

export function normalizeCollectionVarGenerator(
  raw: string | null | undefined,
): CollectionVarGeneratorId | null {
  const g = (raw ?? "").trim().toLowerCase();
  if (!g || g === "literal") return null;
  return GENERATOR_ID_SET.has(g) ? (g as CollectionVarGeneratorId) : null;
}

export function collectionVarGeneratorLabel(
  generator: string | null | undefined,
): string | null {
  const id = normalizeCollectionVarGenerator(generator);
  if (!id) return null;
  return COLLECTION_VAR_GENERATORS.find((g) => g.id === id)?.label ?? id;
}

/** Resolve once for preview / export snapshot. Live uses backend. */
export function resolveCollectionVarGenerator(
  generator: string | null | undefined,
): string {
  const id = normalizeCollectionVarGenerator(generator);
  if (!id) return "";
  switch (id) {
    case "today_yyyymmdd":
      return todayYyyymmdd();
    case "uuid":
      return crypto.randomUUID();
    case "random_digits":
      return randomDigits(10);
    case "korean_name":
      return pick(SURNAMES) + pick(GIVEN);
    case "korean_rrn":
      return koreanRrn();
    default:
      return "";
  }
}

export function resolveCollectionVarValue(row: {
  value: string;
  generator?: string | null;
}): string {
  if (normalizeCollectionVarGenerator(row.generator)) {
    return resolveCollectionVarGenerator(row.generator);
  }
  return row.value;
}

export function collectionVarSourceLabel(row: {
  value: string;
  generator?: string | null;
}): string {
  const label = collectionVarGeneratorLabel(row.generator);
  if (label) return `동적 · ${label}`;
  const v = row.value.trim();
  return v ? `고정 · ${v}` : "값 없음";
}
