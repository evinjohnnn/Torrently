import { useState } from "react";
import { formData } from "../../app/api";
import { useNavigation } from "../../app/router";
import { useI18n } from "../../i18n";
import { Dialog } from "../../ui/Dialog";
import { Icon } from "../../ui/Icon";
import type { Rate } from "./types";

const STARS = Array.from({ length: 10 }, (_, index) => index + 1);

/**
 * Rates a movie or a series out of ten. The stars are a radio group, so
 * arrows move along it; the page comes back with the new rating.
 */
export function RateDialog({ rate, title, onClose }: { rate: Rate | null; title?: string; onClose: () => void }) {
  const { t, path } = useI18n();
  const { submit, busy } = useNavigation();
  const [value, setValue] = useState(0);
  const [hover, setHover] = useState(0);
  const [shownFor, setShownFor] = useState<Rate | null>(null);
  // a new title starts from its own rating
  if (rate !== shownFor) {
    setShownFor(rate);
    setValue(rate?.current ?? 0);
    setHover(0);
  }
  const lit = hover || value;
  const send = async (action: "rate" | "unrate") => {
    if (!rate) return;
    const fields = action === "rate" ? { rating: String(value) } : {};
    onClose();
    await submit(path(`/library/${rate.type}/${rate.videoId}/${action}`), formData(fields), { scroll: false });
  };
  return (
    <Dialog
      open={Boolean(rate)}
      onClose={onClose}
      title={t(rate?.current ? "library.changeRating" : "library.rate")}
      subtitle={title}
    >
      <fieldset className="stars" onMouseLeave={() => setHover(0)}>
        <legend className="visually-hidden">{t("library.rate")}</legend>
        <div className="stars-row">
          {STARS.map((star) => (
            <label key={star} className={star <= lit ? "star lit" : "star"} onMouseEnter={() => setHover(star)}>
              <input
                type="radio"
                name="rating"
                value={star}
                className="visually-hidden"
                checked={value === star}
                onChange={() => setValue(star)}
              />
              <Icon name="star" size={24} />
              <span className="visually-hidden">{star}/10</span>
            </label>
          ))}
        </div>
        <output className="stars-value mono" aria-live="polite">
          {lit ? `${lit}/10` : " "}
        </output>
      </fieldset>
      <div className="dialog-actions">
        {rate && rate.current > 0 && (
          <button type="button" className="button quiet danger" disabled={busy} onClick={() => void send("unrate")}>
            {t("library.drop")}
          </button>
        )}
        <button type="button" className="button quiet" onClick={onClose}>
          {t("library.cancel")}
        </button>
        <button type="button" className="button accent" disabled={!value || busy} onClick={() => void send("rate")}>
          {t("library.rateAction")}
        </button>
      </div>
    </Dialog>
  );
}
