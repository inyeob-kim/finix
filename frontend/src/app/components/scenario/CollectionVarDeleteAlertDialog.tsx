import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogTitle,
} from "../ui/alert-dialog";
import { cn } from "../ui/utils";
import { formatPostmanVar } from "@/lib/postmanBodyBindings";
import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog";

type Props = {
  open: boolean;
  varKey: string | null;
  inUse: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
};

export function CollectionVarDeleteAlertDialog({
  open,
  varKey,
  inUse,
  onOpenChange,
  onConfirm,
}: Props) {
  const token = varKey ? formatPostmanVar(varKey) : "";

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogPortal>
        <AlertDialogOverlay className="z-[120]" />
        <AlertDialogPrimitive.Content
          className={cn(
            "bg-background data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
            "fixed top-[50%] left-[50%] z-[120] grid w-full max-w-[calc(100%-2rem)]",
            "translate-x-[-50%] translate-y-[-50%] gap-4 rounded-md border p-6 shadow-lg duration-200 sm:max-w-md",
          )}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>컬렉션 변수 삭제</AlertDialogTitle>
            <AlertDialogDescription className="text-left space-y-2">
              {varKey ? (
                <>
                  <p>
                    <span className="font-mono text-foreground">{token}</span>{" "}
                    선언을 삭제할까요?
                  </p>
                  {inUse ? (
                    <p>
                      본문에 사용 중입니다. 삭제해도 본문의 토큰은 그대로
                      남습니다.
                    </p>
                  ) : null}
                </>
              ) : (
                <p>이 변수 선언을 삭제할까요?</p>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel type="button">취소</AlertDialogCancel>
            <AlertDialogAction
              type="button"
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={onConfirm}
            >
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogPrimitive.Content>
      </AlertDialogPortal>
    </AlertDialog>
  );
}
