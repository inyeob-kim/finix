import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../../ui/alert-dialog";
import { FinixField, FinixUnderlineInput } from "../../ui/finix-form";
import {
  canConfirmFolderDelete,
  FOLDER_DELETE_TYPED_TOKEN,
} from "../folderDeleteConfirm";

export function FolderDeleteAlertDialog({
  open,
  folderName,
  scenarioCount,
  confirmText,
  onConfirmTextChange,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  folderName: string | null;
  scenarioCount: number;
  confirmText: string;
  onConfirmTextChange: (value: string) => void;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  const needsTypedConfirm = scenarioCount > 0;
  const canDelete = canConfirmFolderDelete(scenarioCount, confirmText);

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>컬렉션 삭제</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-sm text-muted-foreground">
              {folderName ? (
                needsTypedConfirm ? (
                  <>
                    <p>
                      「{folderName}」 컬렉션과 포함된 시나리오{" "}
                      <span className="font-medium text-foreground">
                        {scenarioCount}개
                      </span>
                      가 함께 삭제됩니다. 이 작업은 되돌릴 수 없습니다.
                    </p>
                    <FinixField
                      label="확인 입력"
                      helperText={`계속하려면 ${FOLDER_DELETE_TYPED_TOKEN} 를 입력하세요.`}
                    >
                      <FinixUnderlineInput
                        value={confirmText}
                        onChange={(e) => onConfirmTextChange(e.target.value)}
                        placeholder={FOLDER_DELETE_TYPED_TOKEN}
                        autoComplete="off"
                        spellCheck={false}
                      />
                    </FinixField>
                  </>
                ) : (
                  <p>「{folderName}」 컬렉션을 삭제할까요?</p>
                )
              ) : (
                <p>이 컬렉션을 삭제할까요?</p>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>취소</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50 disabled:pointer-events-none"
            disabled={!canDelete}
            onClick={onConfirm}
          >
            삭제
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
