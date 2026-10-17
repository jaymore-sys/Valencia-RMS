import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

const NARROW = "(max-width: 900px)";

// Phones/tablets: the sidebar becomes a slide-out drawer (styles in mobileCommon.css).
// Returns whether the screen is narrow and the drawer open state (closes on navigation).
export function useMobileShell() {
  const location = useLocation();
  const [isNarrow, setIsNarrow] = useState(
    () => window.matchMedia(NARROW).matches
  );
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    const media = window.matchMedia(NARROW);
    const onChange = (event) => setIsNarrow(event.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  return { isNarrow, mobileNavOpen, setMobileNavOpen };
}

// Copies each column header onto its cells (data-label) so tables can render as
// labelled cards on phones. Attributes only; safe on desktop.
export function useTableLabels(mainSelector) {
  useEffect(() => {
    const main = document.querySelector(mainSelector);
    if (!main) return undefined;

    let frame = 0;

    const label = () => {
      frame = 0;

      // Grid-style tables (HR screens): a ".hr-table-head" row followed by ".hr-table-row" rows.
      main.querySelectorAll(".hr-table-head").forEach((head) => {
        const heads = [...head.children].map((c) => c.textContent.trim());
        let row = head.nextElementSibling;

        while (row && row.classList.contains("hr-table-row")) {
          [...row.children].forEach((cell, index) => {
            if (heads[index] && cell.dataset.label !== heads[index]) {
              cell.dataset.label = heads[index];
            }
          });
          row = row.nextElementSibling;
        }
      });

      main.querySelectorAll("table").forEach((table) => {
        const heads = [...table.querySelectorAll("thead th")].map((th) =>
          th.textContent.trim()
        );

        if (!heads.length) return;

        table.querySelectorAll("tbody tr").forEach((row) => {
          [...row.children].forEach((cell, index) => {
            if (cell.colSpan > 1 || !heads[index]) return;
            if (cell.dataset.label !== heads[index]) {
              cell.dataset.label = heads[index];
            }
          });
        });
      });
    };

    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(label);
    };

    label();

    const observer = new MutationObserver(schedule);
    observer.observe(main, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [mainSelector]);
}

// The phone top bar already shows the page name, so a page's own big <h1> with the same
// name (e.g. "Field Visits", "Superadmin Overview") is marked data-dup-title and hidden on
// phones (mobileCommon.css). Attributes only; desktop is unaffected.
export function useHideDuplicateTitle(mainSelector, title) {
  useEffect(() => {
    const main = document.querySelector(mainSelector);
    if (!main || !title) return undefined;

    const normalize = (text) =>
      String(text || "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim();

    const wanted = normalize(title);
    let timer = 0;

    const mark = () => {
      timer = 0;

      main.querySelectorAll("h1").forEach((heading) => {
        const same = normalize(heading.textContent).includes(wanted);

        if (heading.hasAttribute("data-dup-title") !== same) {
          heading.toggleAttribute("data-dup-title", same);
        }
      });
    };

    const schedule = () => {
      if (!timer) timer = window.setTimeout(mark, 0);
    };

    mark();

    const observer = new MutationObserver(schedule);
    observer.observe(main, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      if (timer) window.clearTimeout(timer);
    };
  }, [mainSelector, title]);
}
