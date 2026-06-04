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
        "w-[148px] shrink-0 border rounded-sm flex flex-col transition-colors",
        isActive
          ? "border-primary/50 bg-primary/5 ring-1 ring-primary/30"
          : "border-border bg-background/60",
        isDragging && "opacity-60",
      )}
    >
      <div className="flex items-center gap-0.5 px-1.5 py-1 border-b border-border/60 shrink-0">
        <div
          ref={gripRef}
          className="p-0.5 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground shrink-0"
          title="드래그로 순서 변경"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <GripVertical className="w-3.5 h-3.5" />
        </div>
        <span className="font-mono text-[11px] text-primary truncate flex-1 min-w-0">
          {svc.code}
        </span>
        <button
          type="button"
          className="p-1 rounded-sm hover:bg-muted text-muted-foreground hover:text-destructive transition-colors shrink-0"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            remove(svc.id);
          }}
          title="시퀀스에서 제거"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
      <button
        type="button"
        className="flex-1 min-h-[2.5rem] text-left px-2 py-2 hover:bg-muted/40 transition-colors rounded-b-sm"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onSelect?.(svc.code);
        }}
      >
        <div className="text-xs font-medium line-clamp-2 leading-snug" title={svc.name}>
          {svc.name}
        </div>
      </button>
    </div>
  );
}
