"use client";

import { useEffect } from "react";

/**
 * Makes the mobile back button close a modal instead of navigating the page
 * away. Modals here are plain React state with no history entry of their
 * own — on a page reached as the very first tab-history entry (e.g. a
 * shared link), hitting back while one is open falls straight through to
 * "nothing before this page," which some mobile browsers surface as
 * exiting the site entirely. Standard, correct fix for this class of bug:
 * push a lightweight history entry while open, close on `popstate` instead
 * of navigating, and consume that entry ourselves if the modal closes any
 * other way (X button, Escape, outside-click) so a later real back-press
 * isn't silently swallowed by our own marker entry.
 */
export function useModalBackClose(isOpen: boolean, onClose: () => void): void {
  useEffect(() => {
    if (!isOpen) return;
    let closedByPop = false;

    history.pushState({ modal: true }, "");
    function handlePopState() {
      closedByPop = true;
      onClose();
    }
    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("popstate", handlePopState);
      if (!closedByPop) history.back();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);
}
