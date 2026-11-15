import { Reorder, useDragControls } from "framer-motion";
import { MotionLeaf } from "../../components/MotionLeaf";
import { GripVertical } from "lucide-react";
import { PLAYER_SOURCES } from "../../constants/sources";

// Capability chips under a server name: the tag ("Multi audio · up to 1080p")
// splits into a labelled accent chip for multi-audio and plain chips for the
// rest, so the roster's measured capabilities stay readable in the list.
function CapabilityChips({ label }) {
  const source = PLAYER_SOURCES.find((s) => s.label === label);
  const parts = String(source?.tag || "")
    .split("·")
    .map((p) => p.trim())
    .filter(Boolean);
  const multi = parts.find((p) => /multi audio/i.test(p));
  const rest = parts.filter((p) => !/multi audio/i.test(p));
  if (!multi && rest.length === 0) return null;
  return (
    <span className="order-tags">
      {multi && <span className="order-tag order-tag--accent">{multi}</span>}
      {rest.map((p) => (
        <span key={p} className="order-tag">
          {p}
        </span>
      ))}
    </span>
  );
}

// Drag-and-drop server priority list. Pointer dragging starts from the grip
// handle (mouse + touch via framer-motion Reorder); keyboard users reorder
// with ArrowUp/ArrowDown on a focused row. No up/down arrow buttons.
function ServerOrderList({ list, onReorder, onMoveKeyboard }) {
  const dragControls = useDragControls();
  // Unconditional: the rows live inside `list.map(...)`, so building the leaf
  // per row would make the hook count follow the number of servers.
  const L = new MotionLeaf();

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
          transition={L.Spring.SHEET}
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
            <span className="w-6 h-6 rounded-full bg-white/10 text-xs font-bold flex items-center justify-center text-white/80 shrink-0">
              {idx + 1}
            </span>
            <span className="order-name">{srv}</span>
            <CapabilityChips label={srv} />
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