/** Why the Rules/Meta 「저장」 button is disabled; null when save is allowed. */
export function getSaveDraftDisabledReason(
  editSaving: boolean,
  editLoading: boolean,
  status: string,
): string | null {
  if (editSaving) {
    return "저장 처리 중입니다. 잠시만 기다려 주세요.";
  }
  if (editLoading) {
    return "YAML을 불러오는 중입니다. 완료 후 저장할 수 있습니다.";
  }
  const st = (status || "").trim().toLowerCase();
  if (st === "draft") {
    return null;
  }
  if (st === "active") {
    return "운영 중(Active) 버전은 덮어쓸 수 없습니다. 변경 내용은 「새 버전 만들기」로 draft를 만드세요.";
  }
  if (st === "superseded") {
    return "과거 운영 버전은 수정·덮어쓰기할 수 없습니다. 「새 버전 만들기」를 사용하세요.";
  }
  if (st === "approved") {
    return "승인된 버전은 덮어쓸 수 없습니다. 「새 버전 만들기」를 사용하세요.";
  }
  return `현재 상태(${status || "—"})에서는 같은 버전에 저장할 수 없습니다. 「새 버전 만들기」를 사용하세요.`;
}

/** Why 「새 버전 만들기」 is disabled; null when the action is allowed. */
export function getNewVersionDisabledReason(
  editSaving: boolean,
  editLoading: boolean,
  status: string,
): string | null {
  if (editSaving) {
    return "처리 중입니다. 잠시만 기다려 주세요.";
  }
  if (editLoading) {
    return "YAML을 불러오는 중입니다. 완료 후 사용할 수 있습니다.";
  }
  const st = (status || "").trim().toLowerCase();
  if (st === "draft") {
    return "초안(Draft)은 「저장」으로 같은 버전에 덮어쓰면 됩니다.";
  }
  return null;
}
