import { useEffect } from "react";

/**
 * Handles modal accessibility: Escape key dismissal and body scroll lock.
 * Apply `role="dialog"` and `aria-modal="true"` to the modal container element.
 */
export function useModalA11y(onClose: () => void) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [onClose]);
}
