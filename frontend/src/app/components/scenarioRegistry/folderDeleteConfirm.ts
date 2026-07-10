export const FOLDER_DELETE_TYPED_TOKEN = "delete";

export function canConfirmFolderDelete(
  scenarioCount: number,
  typedConfirm: string,
): boolean {
  if (scenarioCount <= 0) return true;
  return typedConfirm === FOLDER_DELETE_TYPED_TOKEN;
}
