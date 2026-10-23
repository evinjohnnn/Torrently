import { useEffect, useState } from "react";
import { Dialog } from "../../../ui/Dialog";
import { Icon } from "../../../ui/Icon";
import { t } from "../lib/env.ts";

/** Ten stars: rate a title you watched, or drop the rating. */
export function RatingDialog({
  currentRating,
  onRate,
  onUnrate,
  onClose,
}: {
  currentRating: number;
  onRate: (rating: number) => void;
  onUnrate: () => void;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState(currentRating || 0);
  const [hovered, setHovered] = useState(0);

  useEffect(() => {
    setSelected(currentRating || 0);
  }, [currentRating]);

  const shown = hovered || selected;

  return (
    <Dialog open onClose={onClose} title={t("discover.rate")}>
      <div className="d-stars" role="radiogroup" aria-label={t("discover.rate")} onMouseLeave={() => setHovered(0)}>
        {Array.from({ length: 10 }, (_, i) => i + 1).map((val) => (
          <button
            key={val}
            type="button"
            role="radio"
            aria-checked={val === selected}
            aria-label={`${val}/10`}
            className={val <= shown ? "d-star on" : "d-star"}
            onClick={() => {
              setSelected(val);
              setHovered(0);
            }}
            onMouseEnter={() => setHovered(val)}
          >
            <Icon name="star" size={22} fill={val <= shown ? "currentColor" : "none"} />
          </button>
        ))}
      </div>
      <p className="d-star-value mono" aria-live="polite">
        {shown > 0 ? `${shown}/10` : " "}
      </p>
      <div className="dialog-actions">
        <button type="button" className="button quiet" onClick={onClose}>
          {t("discover.cancel")}
        </button>
        {currentRating > 0 && (
          <button type="button" className="button danger" onClick={onUnrate}>
            {t("discover.dropRating")}
          </button>
        )}
        <button type="button" className="button primary" onClick={() => selected > 0 && onRate(selected)} disabled={selected === 0}>
          {t("discover.rate")}
        </button>
      </div>
    </Dialog>
  );
}
