import { useState } from "react";
import { Icon } from "../../../../ui/Icon";
import { tf } from "../../lib/env.ts";
import type { AIChip } from "../../types.ts";

// AI suggestion chips shown under the free-form query input. Clicking a
// chip sends its pre-expanded `query` string to the recommender.
//
// Phone: the first 2 chips, full label, plus a "+N more" expander that
// reveals the rest, so the section stays short enough for the catalogue
// to stay in view. Wider screens show every chip.

const MOBILE_INITIAL = 2;

export function AIChipsRow({
  chips,
  onSelect,
  disabled,
}: {
  chips: AIChip[];
  onSelect: (chip: AIChip) => void;
  disabled: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  if (!chips || chips.length === 0) return null;

  const hiddenCount = Math.max(0, chips.length - MOBILE_INITIAL);

  return (
    <div className={expanded ? "ai-chips expanded" : "ai-chips"}>
      {chips.map((chip, i) => (
        <button
          key={chip.id}
          type="button"
          disabled={disabled}
          onClick={() => onSelect(chip)}
          className={i >= MOBILE_INITIAL ? "ai-chip later" : "ai-chip"}
          title={chip.query}
        >
          {chip.icon && <span aria-hidden="true">{chip.icon}</span>}
          <span>{chip.label}</span>
        </button>
      ))}
      {!expanded && hiddenCount > 0 && (
        <button type="button" onClick={() => setExpanded(true)} className="ai-chip ai-more">
          {tf("discover.ai.moreChips", hiddenCount)}
          <Icon name="chevron" size={14} />
        </button>
      )}
    </div>
  );
}
