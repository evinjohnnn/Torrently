import { useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import { Icon } from "../../../ui/Icon";
import { t } from "../lib/env.ts";

export function SearchBar({
  onSearch,
  onExit,
  isSearchMode,
  initialQuery,
}: {
  onSearch: (query: string) => void;
  onExit: () => void;
  isSearchMode: boolean;
  initialQuery: string;
}) {
  const [value, setValue] = useState("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync input value with initialQuery (restored from URL or popstate)
  useEffect(() => {
    if (initialQuery != null) setValue(initialQuery);
  }, [initialQuery]);

  // Reset input when exiting search mode
  useEffect(() => {
    if (!isSearchMode) setValue("");
  }, [isSearchMode]);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const v = event.target.value;
    setValue(v);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => onSearch(v), 400);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      clearTimeout(timerRef.current);
      setValue("");
      onExit();
      inputRef.current?.blur();
    }
  };

  const handleClear = () => {
    clearTimeout(timerRef.current);
    setValue("");
    onExit();
    inputRef.current?.focus();
  };

  return (
    <div className="d-search" role="search">
      <Icon name="search" className="d-search-icon" />
      <label className="visually-hidden" htmlFor="discover-search">
        {t("discover.search")}
      </label>
      <input
        id="discover-search"
        ref={inputRef}
        type="search"
        className="d-search-input"
        placeholder={t("discover.search")}
        autoComplete="off"
        spellCheck={false}
        enterKeyHint="search"
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
      />
      {value.length > 0 && (
        <button type="button" className="icon-button" onClick={handleClear} aria-label={t("discover.cancel")}>
          <Icon name="close" size={18} />
        </button>
      )}
    </div>
  );
}
