import { useRef } from "react";
import { GripVertical, Trash2 } from "lucide-react";
import { useDrag, useDrop } from "react-dnd";
import { SERVICE_ITEM_TYPE } from "../constants";
import type { ServiceDraft } from "../types";
import { cn } from "../../ui/utils";

export function ServiceRow({
  svc,
  index,
  move,
  remove,
  isActive = false,
  onSelect,
}: {
  svc: ServiceDraft;
  index: number;
  move: (dragIndex: number, hoverIndex: number) => void;
  remove: (id: string) => void;
  isActive?: boolean;
  onSelect?: (serviceCode: string) => void;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  const gripRef = useRef<HTMLDivElement>(null);

  const [{ isDragging }, drag, preview] = useDrag({
    type: SERVICE_ITEM_TYPE,
    item: { index },
    collect: (monitor) => ({ isDragging: monitor.isDragging() }),
  });

  const [, drop] = useDrop({
    accept: SERVICE_ITEM_TYPE,
    hover(item: { index: number }, monitor) {
      if (!monitor.isOver({ shallow: true })) return;
      const dragIndex = item.index;
      const hoverIndex = index;
      if (dragIndex === hoverIndex) return;
      move(dragIndex, hoverIndex);
      item.index = hoverIndex;
    },
  });

  preview(rowRef);
  drop(rowRef);
  drag(gripRef);

  return (
    <div
      ref={rowRef}
      data-service-row
      className={cn(
        "border rounded-sm flex items-stretch transition-colors",
        isActive
          ? "border-primary/50 bg-primary/5 ring-1 ring-primary/30"
          : "border-border bg-background/60",
        isDragging && "opacity-60",
      )}
    >
      <div
        ref={gripRef}
        className="flex items-center px-2 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground shrink-0"
        title="드래그로 순서 변경"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <GripVertical className="w-4 h-4" />
      </div>
      <button
        type="button"
        className="flex-1 min-w-0 text-left px-2 py-3 hover:bg-muted/40 transition-colors rounded-sm"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onSelect?.(svc.code);
        }}
      >
        <div className="text-sm font-medium truncate">{svc.name}</div>
        <div className="text-xs font-mono text-muted-foreground">{svc.code}</div>
      </button>
      <button
        type="button"
        className="self-center p-2 mx-1 rounded-sm border border-transparent hover:bg-muted hover:border-border text-muted-foreground hover:text-destructive transition-colors shrink-0"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          remove(svc.id);
        }}
        title="시퀀스에서 제거"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
}
