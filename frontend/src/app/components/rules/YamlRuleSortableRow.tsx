import type { ReactNode, Ref } from "react";
import { useDrag, useDrop } from "react-dnd";

export const YAML_RULE_ROW_DND_TYPE = "YAML_RULE_ROW";

type YamlRuleSortableRowProps = {
  displayIndex: number;
  moveRule: (dragIndex: number, hoverIndex: number) => void;
  onDragEnd: () => void;
  disabled?: boolean;
  children: (opts: {
    dragRef: Ref<HTMLDivElement>;
    isDragging: boolean;
  }) => ReactNode;
};

export function YamlRuleSortableRow({
  displayIndex,
  moveRule,
  onDragEnd,
  disabled = false,
  children,
}: YamlRuleSortableRowProps) {
  const [{ isDragging }, drag, preview] = useDrag({
    type: YAML_RULE_ROW_DND_TYPE,
    item: { index: displayIndex },
    canDrag: !disabled,
    end: () => onDragEnd(),
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  });

  const [, drop] = useDrop({
    accept: YAML_RULE_ROW_DND_TYPE,
    hover: (item: { index: number }) => {
      if (item.index !== displayIndex) {
        moveRule(item.index, displayIndex);
        item.index = displayIndex;
      }
    },
  });

  return (
    <div
      ref={(node) => {
        if (node) preview(drop(node));
      }}
      className={isDragging ? "opacity-50" : undefined}
    >
      {children({ dragRef: drag, isDragging })}
    </div>
  );
}
