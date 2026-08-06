/**
 * Finix standard large panel width (82vw).
 * Used for YAML edit sheet, history, scenario edit, import, RAW view, run results, etc.
 */
export const FINIX_STANDARD_PANEL_WIDTH =
  "w-[min(82rem,82vw,calc(100vw-2rem))] max-w-none sm:max-w-none";

/** Large panel + side rail (e.g. YAML dynamic-value macro panel). */
export const FINIX_STANDARD_PANEL_WITH_RAIL_WIDTH =
  "w-[min(92rem,92vw,calc(100vw-1.5rem))] max-w-none sm:max-w-none";

/** Centered large dialog height. */
export const FINIX_STANDARD_PANEL_HEIGHT = "h-[min(52rem,92vh)]";

/** @deprecated Prefer FINIX_STANDARD_PANEL_WIDTH */
export const FINIX_LARGE_MODAL_MAX_WIDTH = FINIX_STANDARD_PANEL_WIDTH;

export const FINIX_LARGE_MODAL_SIZE =
  `${FINIX_STANDARD_PANEL_WIDTH} ${FINIX_STANDARD_PANEL_HEIGHT}`;

export const FINIX_LARGE_MODAL_WITH_RAIL_SIZE =
  `${FINIX_STANDARD_PANEL_WITH_RAIL_WIDTH} ${FINIX_STANDARD_PANEL_HEIGHT}`;

/** Centered large dialog — fixed header/footer + scrollable body. */
export const FINIX_LARGE_MODAL_CONTENT =
  `flex flex-col gap-0 p-0 overflow-hidden ${FINIX_LARGE_MODAL_SIZE}`;

export const FINIX_LARGE_MODAL_WITH_RAIL_CONTENT =
  `flex flex-col gap-0 p-0 overflow-hidden ${FINIX_LARGE_MODAL_WITH_RAIL_SIZE}`;

/** Scrollable centered large dialog (import/export JSON, etc.). */
export const FINIX_LARGE_MODAL_SCROLL_CONTENT =
  `w-full max-h-[92vh] overflow-y-auto ${FINIX_STANDARD_PANEL_WIDTH}`;

/** YAML 케이스 목록 사이드바 — 시트/rail 열림과 무관하게 고정 폭. */
export const FINIX_YAML_CASE_SIDEBAR_WIDTH = "w-full sm:w-[24rem] shrink-0";

/** YAML 동적값 side rail width (editor 영역 안에서만 차지). */
export const FINIX_YAML_MACRO_RAIL_WIDTH = "w-[min(24rem,100%)] shrink-0";

/** Right-side sheet — same width as standard large panel. */
export const FINIX_STANDARD_SHEET_CONTENT =
  `flex flex-col gap-0 p-0 overflow-hidden h-full ${FINIX_STANDARD_PANEL_WIDTH}`;

export const FINIX_STANDARD_SHEET_WITH_RAIL_CONTENT =
  `flex flex-col gap-0 p-0 overflow-hidden h-full ${FINIX_STANDARD_PANEL_WITH_RAIL_WIDTH}`;

/** @deprecated Use FINIX_STANDARD_SHEET_CONTENT */
export const FINIX_YAML_EDIT_SHEET_SIZE = FINIX_STANDARD_PANEL_WIDTH;

/** @deprecated Use FINIX_STANDARD_PANEL_WITH_RAIL_WIDTH */
export const FINIX_YAML_EDIT_SHEET_WITH_RAIL_SIZE =
  FINIX_STANDARD_PANEL_WITH_RAIL_WIDTH;

/** @deprecated Use FINIX_STANDARD_SHEET_CONTENT */
export const FINIX_YAML_EDIT_SHEET_CONTENT = FINIX_STANDARD_SHEET_CONTENT;

/** @deprecated Use FINIX_STANDARD_SHEET_WITH_RAIL_CONTENT */
export const FINIX_YAML_EDIT_SHEET_WITH_RAIL_CONTENT =
  FINIX_STANDARD_SHEET_WITH_RAIL_CONTENT;

const FINIX_TC_RUN_MODAL_SHELL =
  "z-[120] !flex flex-col gap-0 !p-0 overflow-hidden rounded-sm";

/**
 * Test-case run config / loading — compact dialog for baseUrl + mode.
 */
export const FINIX_TC_RUN_CONFIG_MODAL_SIZE =
  "w-[min(28rem,calc(100vw-2rem))] h-auto max-h-[min(34rem,85vh)] max-w-[calc(100vw-2rem)] sm:max-w-none";

export const FINIX_TC_RUN_CONFIG_MODAL_CONTENT =
  `${FINIX_TC_RUN_MODAL_SHELL} ${FINIX_TC_RUN_CONFIG_MODAL_SIZE}`;

/** Test-case run result — standard large panel footprint. */
export const FINIX_TC_RUN_RESULT_MODAL_CONTENT =
  `${FINIX_TC_RUN_MODAL_SHELL} ${FINIX_LARGE_MODAL_SIZE}`;
