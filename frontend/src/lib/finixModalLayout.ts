/** Large modal width/height shared across Rules/Meta, Scenario registry, etc. */
export const FINIX_LARGE_MODAL_SIZE =
  "w-[min(60rem,calc(100vw-2rem))] h-[min(52rem,92vh)] max-w-[calc(100vw-2rem)] sm:max-w-none";

/**
 * YAML 편집 + 동적값 오른쪽 패널 — 에디터 폭을 유지한 채 모달만 확장.
 * (~60rem editor + ~30rem rail)
 */
export const FINIX_LARGE_MODAL_WITH_RAIL_SIZE =
  "w-[min(90rem,calc(100vw-2rem))] h-[min(52rem,92vh)] max-w-[calc(100vw-2rem)] sm:max-w-none";

export const FINIX_LARGE_MODAL_CONTENT =
  `flex flex-col gap-0 p-0 overflow-hidden ${FINIX_LARGE_MODAL_SIZE}`;

export const FINIX_LARGE_MODAL_WITH_RAIL_CONTENT =
  `flex flex-col gap-0 p-0 overflow-hidden ${FINIX_LARGE_MODAL_WITH_RAIL_SIZE}`;

export const FINIX_LARGE_MODAL_MAX_WIDTH =
  "sm:max-w-[min(60rem,calc(100vw-2rem))]";

/** YAML 동적값 side rail width (pairs with WITH_RAIL modal). */
export const FINIX_YAML_MACRO_RAIL_WIDTH = "w-[min(30rem,100%)]";

const FINIX_TC_RUN_MODAL_SHELL =
  "z-[120] !flex flex-col gap-0 !p-0 overflow-hidden rounded-sm";

/**
 * Test-case run config / loading — compact dialog for baseUrl + mode.
 */
export const FINIX_TC_RUN_CONFIG_MODAL_SIZE =
  "w-[min(28rem,calc(100vw-2rem))] h-auto max-h-[min(34rem,85vh)] max-w-[calc(100vw-2rem)] sm:max-w-none";

export const FINIX_TC_RUN_CONFIG_MODAL_CONTENT =
  `${FINIX_TC_RUN_MODAL_SHELL} ${FINIX_TC_RUN_CONFIG_MODAL_SIZE}`;

/**
 * Test-case run result — same footprint as YAML / other large modals.
 */
export const FINIX_TC_RUN_RESULT_MODAL_CONTENT =
  `${FINIX_TC_RUN_MODAL_SHELL} ${FINIX_LARGE_MODAL_SIZE}`;
