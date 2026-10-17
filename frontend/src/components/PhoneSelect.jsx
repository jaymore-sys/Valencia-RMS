import { Children, isValidElement, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useIsPhone } from "./ReadMoreText";
import "./PhoneSelect.css";

// Drop-in replacement for a native <select> (same props and <option> children).
// Desktop: the native select, unchanged.
// Phones: a button that opens a bottom sheet with a search box, the options and a Cancel button
// (the native phone picker has no search and no clear Cancel for long lists).
export default function PhoneSelect({
  value,
  onChange,
  children,
  className,
  style,
  title,
  searchAfter = 8,
}) {
  const phone = useIsPhone();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const options = useMemo(() => {
    const list = [];

    Children.toArray(children).forEach((child) => {
      if (!isValidElement(child) || child.type !== "option") return;

      const label = Children.toArray(child.props.children).join("");

      list.push({
        value: String(child.props.value ?? label),
        label,
      });
    });

    return list;
  }, [children]);

  if (!phone) {
    return (
      <select
        value={value}
        onChange={onChange}
        className={className}
        style={style}
        title={title}
      >
        {children}
      </select>
    );
  }

  const current = options.find((item) => item.value === String(value));
  const visible = options.filter((item) =>
    item.label.toLowerCase().includes(query.trim().toLowerCase())
  );

  const close = () => {
    setOpen(false);
    setQuery("");
  };

  const pick = (next) => {
    onChange({ target: { value: next } });
    close();
  };

  return (
    <>
      <button
        type="button"
        className={`rms-phone-select ${className || ""}`}
        style={style}
        title={title}
        onClick={() => setOpen(true)}
      >
        <span>{current ? current.label : "Select"}</span>
        <i aria-hidden="true">▾</i>
      </button>

      {open &&
        createPortal(
          <div
            className="rms-sheet-backdrop"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) close();
            }}
          >
            <div className="rms-sheet" role="dialog" aria-modal="true">
              {options.length > searchAfter && (
                <input
                  type="search"
                  className="rms-sheet-search"
                  placeholder="Search…"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  autoFocus
                />
              )}

              <div className="rms-sheet-list">
                {visible.length === 0 ? (
                  <div className="rms-sheet-empty">No matches</div>
                ) : (
                  visible.map((item) => (
                    <button
                      type="button"
                      key={item.value}
                      className={`rms-sheet-option ${
                        item.value === String(value) ? "selected" : ""
                      }`}
                      onClick={() => pick(item.value)}
                    >
                      {item.label}
                    </button>
                  ))
                )}
              </div>

              <button
                type="button"
                className="rms-sheet-cancel"
                onClick={close}
              >
                Cancel
              </button>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
