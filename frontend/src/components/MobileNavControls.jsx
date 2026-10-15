import { Menu } from "lucide-react";

// Menu button + dimmed backdrop for the phone drawer. Hidden on desktop (mobileCommon.css).
export default function MobileNavControls({ onOpen, onClose }) {
  return (
    <>
      <button
        type="button"
        className="rms-menu-btn"
        aria-label="Open menu"
        onClick={onOpen}
      >
        <Menu size={22} />
      </button>

      <div
        className="rms-nav-backdrop"
        onClick={onClose}
        aria-hidden="true"
      />
    </>
  );
}
