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
  bundleVersion: _bundleVersion,
  status,
  disabled,
  onDeleted,
  onError,
}: Props) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const isCurrent = (status || "").toLowerCase() === "active";

  const handleConfirm = async () => {
    setSubmitting(true);
    onError("");
    try {
      await deleteServiceRulesBundle(serviceCode, bundleId);
      setOpen(false);
      await onDeleted();
    } catch (e) {
      onError(
        e instanceof ApiError ? e.message : "이력을 삭제하지 못했습니다.",
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
          disabled={disabled || submitting || isCurrent}
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-sm border border-border text-sm font-medium hover:bg-muted disabled:opacity-50"
          aria-label="이력 스냅샷 삭제"
        >
          <Trash2 className="w-3.5 h-3.5" />
          이력 삭제
        </button>
      }
      title={<>{serviceCode} 이력 삭제</>}
      description={
        isCurrent
          ? "현재 적용본과 동일한 스냅샷은 삭제할 수 없습니다."
          : "선택한 이력 스냅샷만 삭제합니다. 되돌릴 수 없습니다."
      }
      confirmLabel={submitting ? "삭제 중…" : "삭제"}
      onCancel={() => setOpen(false)}
      onConfirm={() => void handleConfirm()}
    />
  );
}
