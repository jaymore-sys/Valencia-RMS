import { useEffect, useState } from "react";

// Long text collapses to the first `words` words with a "Read more" toggle on phones.
// Desktop (> 700px) always shows the full text, so it looks exactly as before.

export function useIsPhone() {
  const [phone, setPhone] = useState(
    () => window.matchMedia("(max-width: 700px)").matches
  );

  useEffect(() => {
    const media = window.matchMedia("(max-width: 700px)");
    const onChange = (event) => setPhone(event.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  return phone;
}

// First `words` words of `text` (line breaks kept), or null when it is already short.
export function firstWords(text, words) {
  const matches = [...text.matchAll(/\S+/g)];
  if (matches.length <= words) return null;
  const last = matches[words - 1];
  return `${text.slice(0, last.index + last[0].length)}…`;
}

export function ReadMoreButton({ open, onToggle }) {
  return (
    <button
      type="button"
      className="rms-read-more"
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
    >
      {open ? "Show less" : "Read more"}
    </button>
  );
}

export default function ReadMoreText({ text, words = 20 }) {
  const [open, setOpen] = useState(false);
  const phone = useIsPhone();

  const value = text == null ? "" : String(text);
  const short = phone ? firstWords(value, words) : null;

  if (!short) return value;

  return (
    <>
      {open ? value : short}{" "}
      <ReadMoreButton open={open} onToggle={() => setOpen((previous) => !previous)} />
    </>
  );
}
