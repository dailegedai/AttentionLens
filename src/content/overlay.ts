import type { PageRegion, RegionKind } from "./annotate";

export const OVERLAY_ID = "attention-lens-overlay";

interface OverlayBox {
  element: HTMLElement;
  box: HTMLDivElement;
}

const KIND_STYLES: Record<RegionKind, { border: string; background: string }> = {
  mainContent: { border: "#2e9e5b", background: "rgba(46,158,91,0.08)" },
  recommendation: { border: "#e67e22", background: "rgba(230,126,34,0.08)" },
  advertisement: { border: "#8e44ad", background: "rgba(142,68,173,0.08)" },
  cta: { border: "#d4ac0d", background: "rgba(212,172,13,0.08)" },
  distraction: { border: "#2c6fbb", background: "rgba(44,111,187,0.08)" },
};

let layer: HTMLDivElement | null = null;
let boxes: OverlayBox[] = [];
let animationFrame = 0;

export function isOverlayVisible(): boolean {
  return layer !== null;
}

export function showOverlay(regions: PageRegion[]): number {
  hideOverlay();

  const host = document.createElement("div");
  host.id = OVERLAY_ID;
  Object.assign(host.style, {
    position: "fixed",
    inset: "0",
    pointerEvents: "none",
    zIndex: "2147483647",
  });

  for (const region of regions) {
    const box = document.createElement("div");
    applyBoxStyle(box, region.kind);

    const label = document.createElement("span");
    label.textContent = region.label;
    applyLabelStyle(label);

    box.append(label);
    host.append(box);
    boxes.push({ element: region.element, box });
  }

  document.documentElement.append(host);
  layer = host;
  positionBoxes();
  window.addEventListener("scroll", schedulePosition, true);
  window.addEventListener("resize", schedulePosition);

  return boxes.length;
}

export function hideOverlay(): void {
  window.removeEventListener("scroll", schedulePosition, true);
  window.removeEventListener("resize", schedulePosition);
  if (animationFrame) cancelAnimationFrame(animationFrame);
  animationFrame = 0;
  layer?.remove();
  layer = null;
  boxes = [];
}

function applyBoxStyle(box: HTMLDivElement, kind: RegionKind): void {
  const style = KIND_STYLES[kind];
  Object.assign(box.style, {
    position: "absolute",
    top: "0",
    left: "0",
    border: `2px solid ${style.border}`,
    borderRadius: "6px",
    boxSizing: "border-box",
    background: style.background,
    pointerEvents: "none",
  });
}

function applyLabelStyle(label: HTMLSpanElement): void {
  Object.assign(label.style, {
    position: "absolute",
    top: "-17px",
    left: "-2px",
    padding: "1px 6px",
    borderRadius: "4px 4px 0 0",
    background: "#111827",
    color: "#ffffff",
    font: "600 10px/16px system-ui, sans-serif",
    whiteSpace: "nowrap",
  });
}

function schedulePosition(): void {
  if (animationFrame) return;
  animationFrame = requestAnimationFrame(() => {
    animationFrame = 0;
    positionBoxes();
  });
}

function positionBoxes(): void {
  for (const { element, box } of boxes) {
    if (!element.isConnected) {
      box.style.display = "none";
      continue;
    }

    const rect = element.getBoundingClientRect();
    const visible =
      rect.width > 0 &&
      rect.height > 0 &&
      rect.right > 0 &&
      rect.bottom > 0 &&
      rect.left < window.innerWidth &&
      rect.top < window.innerHeight;

    box.style.display = visible ? "block" : "none";
    if (!visible) continue;
    box.style.transform = `translate(${Math.round(rect.left)}px, ${Math.round(rect.top)}px)`;
    box.style.width = `${Math.round(rect.width)}px`;
    box.style.height = `${Math.round(rect.height)}px`;
  }
}
