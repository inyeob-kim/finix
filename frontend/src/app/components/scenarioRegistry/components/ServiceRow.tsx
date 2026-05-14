import { GripVertical, Trash2 } from "lucide-react";
import { useDrag, useDrop } from "react-dnd";
import { SERVICE_ITEM_TYPE } from "../constants";
import type { ServiceDraft } from "../types";

export function ServiceRow({
  svc,
  index,
  move,
  remove,
}: {
  svc: ServiceDraft;
  index: number;
  move: (dragIndex: number, hoverIndex: number) => void;
  remove: (id: string) => void;
}) {
  const [{ isDragging }, drag, preview] = useDrag({
    type: SERVICE_ITEM_TYPE,
    item: { index },
    collect: (monitor) => ({ isDragging: monitor.isDragging() }),
  });

  const [, drop] = useDrop({
    accept: SERVICE_ITEM_TYPE,
    hover: (item: { index: number }) => {
      if (item.index !== index) {
        move(item.index, index);
        item.index = index;
      }
    },
  });

  return (
    <div
      ref={(node) => {
        if (node) preview(drop(node));
      }}
      className={[
        "border border-border rounded-sm bg-background/60",
        "px-3 py-3",
        isDragging ? "opacity-60" : "",
      ].join(" ")}
    >
      <div className="flex items-center gap-3">
        <div
          ref={(node) => {
            if (node) drag(node);
          }}
          className="mt-2 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground"
          title="드래그로 순서 변경"
        >
          <GripVertical className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate">{svc.name}</div>
          <div className="text-xs font-mono text-muted-foreground">{svc.code}</div>
        </div>
        <button
          type="button"
          className="self-center p-2 rounded-sm border border-transparent hover:bg-muted hover:border-border text-muted-foreground hover:text-destructive transition-colors"
          onClick={() => remove(svc.id)}
          title="삭제"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

