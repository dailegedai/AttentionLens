const HIDDEN_CLASS = "attention-lens-hidden";

interface HiddenRecord {
  element: HTMLElement;
  displayValue: string;
  displayPriority: string;
}

let hiddenRecords: HiddenRecord[] = [];

/**
 * Hides elements with inline CSSOM styles instead of an injected stylesheet.
 * Injected <style> elements are subject to the page's CSP, so strict-CSP pages
 * would silently drop the rule while reporting success.
 */
export function enterFocusMode(elements: HTMLElement[]): number {
  exitFocusMode();

  const candidates = Array.from(new Set(elements)).filter(
    (element) =>
      element.isConnected &&
      element !== document.body &&
      element !== document.documentElement,
  );

  for (const element of candidates) {
    hiddenRecords.push({
      element,
      displayValue: element.style.getPropertyValue("display"),
      displayPriority: element.style.getPropertyPriority("display"),
    });
    element.classList.add(HIDDEN_CLASS);
    element.style.setProperty("display", "none", "important");
  }

  return countActuallyHidden();
}

export function exitFocusMode(): void {
  for (const record of hiddenRecords) {
    record.element.classList.remove(HIDDEN_CLASS);
    if (record.displayValue) {
      record.element.style.setProperty("display", record.displayValue, record.displayPriority);
    } else {
      record.element.style.removeProperty("display");
    }
  }
  hiddenRecords = [];
}

export function isFocusMode(): boolean {
  return hiddenRecords.length > 0;
}

export function getHiddenCount(): number {
  return countActuallyHidden();
}

function countActuallyHidden(): number {
  let count = 0;
  for (const record of hiddenRecords) {
    if (isActuallyHidden(record.element)) count += 1;
  }
  return count;
}

function isActuallyHidden(element: HTMLElement): boolean {
  if (typeof window === "undefined" || typeof window.getComputedStyle !== "function") {
    return true;
  }

  try {
    return window.getComputedStyle(element).display === "none";
  } catch {
    return true;
  }
}
