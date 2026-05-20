import { useState } from "react";
import { Trash2 } from "lucide-react";
import { deleteServiceRulesBundle } from "@/api/serviceRulesApi";
import { ApiError } from "@/api/client";
import { ConfirmPopover } from "../scenarioRegistry/components/ConfirmPopover";

type Props = {
  serviceCode: string;
  bundleId: number;
  bundleVersion: number;
  status: string;
  disabled?: boolean;
  onDeleted: () => void | Promise<void>;
  onError: (message: string) => void;
};

export function RulesMetaBundleDelete({
  serviceCode,
  bundleId,
  bundleVersion,
  status,
  disabled,
  onDeleted,
  onError,
}: Props) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const isActive = (status || "").toLowerCase() === "active";

  const handleConfirm = async () => {
    setSubmitting(true);
    onError("");
    try {
      await deleteServiceRulesBundle(serviceCode, bundleId);
      setOpen(false);
      await onDeleted();
    } catch (e) {
      onError(
        e instanceof ApiError ? e.message : "규칙 번들을 삭제하지 못했습니다.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ConfirmPopover
      open={open}
      onOpenChange={setOpen}
      anchor={
        <button
          type="button"
          disabled={disabled || submitting}
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-sm border border-border text-sm font-medium text-muted-foreground hover:bg-destructive/10 hover:border-destructive/40 hover:text-destructive disabled:opacity-50"
          aria-label={`v${bundleVersion} 번들 삭제`}
        >
          <Trash2 className="w-3.5 h-3.5" />
          이 버전 삭제
        </button>
      }
      title={
        <>
          {serviceCode} v{bundleVersion} 삭제
        </>
      }
      description={
        isActive
          ? "Active 번들입니다. 삭제하면 이 서비스에 활성 규칙이 없어집니다."
          : "선택한 버전 번들만 삭제합니다. 되돌릴 수 없습니다."
      }
      confirmLabel={submitting ? "삭제 중…" : "삭제"}
      onCancel={() => setOpen(false)}
      onConfirm={() => void handleConfirm()}
    />
  );
}
