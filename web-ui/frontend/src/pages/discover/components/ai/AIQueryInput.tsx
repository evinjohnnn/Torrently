import { useState, type FormEvent } from "react";
import { Icon } from "../../../../ui/Icon";
import { t } from "../../lib/env.ts";

// Free-form query input used for both the initial recommend call and the
// refine bar: one field and its button, like the home page's search.
//
// Button copy is intentionally playful:
//   initial → "Pitch me"   (as if asking an agent for a pitch)
//   refine  → "Remix"      (retake the same list with new criteria)
export function AIQueryInput({
  mode = "initial",
  initialValue = "",
  disabled,
  onSubmit,
  maxLength = 500,
}: {
  mode?: "initial" | "refine";
  initialValue?: string;
  disabled: boolean;
  onSubmit: (query: string) => void;
  maxLength?: number;
}) {
  const [value, setValue] = useState(initialValue);
  const trimmed = value.trim();
  const placeholder = t(mode === "initial" ? "discover.ai.initialPlaceholder" : "discover.ai.refinePlaceholder");

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!trimmed || disabled) return;
    onSubmit(trimmed);
  };

  return (
    <form onSubmit={handleSubmit} className="ai-form">
      <Icon name="sparkle" className="ai-form-icon" />
      <input
        type="text"
        className="ai-input"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        maxLength={maxLength}
        disabled={disabled}
        enterKeyHint="send"
      />
      {value.length > maxLength * 0.8 && (
        <span className="ai-count mono">
          {value.length}/{maxLength}
        </span>
      )}
      <button type="submit" className="button accent" disabled={disabled || !trimmed}>
        {t(mode === "initial" ? "discover.ai.pitchMe" : "discover.ai.remix")}
      </button>
    </form>
  );
}
