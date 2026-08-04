/** Why the Rules/Meta 「저장」 button is disabled; null when save is allowed. */
export function getSaveDraftDisabledReason(
  editSaving: boolean,
  editLoading: boolean,
  _status: string,
  hasUnsavedChanges = true,
): string | null {
  if (editSaving) {
    return "저장 처리 중입니다. 잠시만 기다려 주세요.";
  }
  if (editLoading) {
    return "YAML을 불러오는 중입니다. 완료 후 저장할 수 있습니다.";
  }
  if (!hasUnsavedChanges) {
    return "변경된 내용이 없습니다.";
  }
  return null;
}
