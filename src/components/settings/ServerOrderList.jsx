import { Reorder, useDragControls } from "framer-motion";
import { GripVertical } from "lucide-react";

// Drag-and-drop server priority list. Pointer dragging starts from the grip
// handle (mouse + touch via framer-motion Reorder); keyboard users reorder
// with ArrowUp/ArrowDown on a focused row. No up/down arrow buttons.
function ServerOrderList({ list, onReorder, onMoveKeyboard }) {
  const dragControls = useDragControls();

  return (
    <Reorder.Group
      axis="y"
      values={list}
      onReorder={onReorder}
      className="order-list"
      role="list"
      aria-label="Server priority order"
    >
      {list.map((srv, idx) => (
        <Reorder.Item
          key={srv}
          value={srv}
          dragListener={false}
          dragControls={dragControls}
          whileDrag={{ scale: 1.02 }}
          transition={{ type: "spring", stiffness: 400, damping: 32 }}
          className="order-item"
          role="listitem"
          aria-posinset={idx + 1}
          aria-setsize={list.length}
          aria-label={`${srv}, priority ${idx + 1} of ${list.length}. Press arrow up or down to reorder.`}
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "ArrowUp") {
              e.preventDefault();
              onMoveKeyboard(idx, -1);
            } else if (e.key === "ArrowDown") {
              e.preventDefault();
              onMoveKeyboard(idx, 1);
            }
          }}
        >
          <div className="flex items-center gap-3 min-w-0">
            <span
              className="order-grip order-grip--drag"
              tabIndex={-1}
              aria-hidden="true"
              title="Drag to reorder"
              onPointerDown={(e) => dragControls.start(e)}
            >
              <GripVertical className="w-4 h-4" />
            </span>
            <span className="w-6 h-6 rounded-full bg-white/10 text-[11px] font-bold flex items-center justify-center text-white/80 shrink-0">
              {idx + 1}
            </span>
            <span className="order-name">{srv}</span>
          </div>
          <span className="order-hint" aria-hidden="true">
            {idx === 0 ? "Default" : `Priority ${idx + 1}`}
          </span>
        </Reorder.Item>
      ))}
    </Reorder.Group>
  );
}

export default ServerOrderList;