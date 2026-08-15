export interface TooltipPoint {
  x: number;
  y: number;
}

/** Fixed gap above the finger — avoid PointerEvent.height (unreliable on mobile). */
export const TOUCH_TOOLTIP_OFFSET = 56;

/**
 * Viewport-aware tooltip placement.
 * Touch: centered above the contact point so content is not hidden under the thumb.
 */
export function clampTooltipPosition(
  position: TooltipPoint,
  card: HTMLElement,
  pointerType?: string,
): TooltipPoint {
  const rect = card.getBoundingClientRect();
  const cardWidth = rect.width || 320;
  const cardHeight = rect.height || 200;
  const pad = 12;

  if (pointerType === 'touch') {
    let posX = position.x - cardWidth / 2;
    let posY = position.y - cardHeight - TOUCH_TOOLTIP_OFFSET;

    posX = Math.max(pad, Math.min(posX, window.innerWidth - cardWidth - pad));
    posY = Math.max(pad, Math.min(posY, window.innerHeight - cardHeight - pad));

    return { x: posX, y: posY };
  }

  let posX = position.x + 20;
  let posY = position.y + 20;
  if (posX + cardWidth > window.innerWidth) posX = position.x - cardWidth - 20;
  if (posY + cardHeight > window.innerHeight) posY = position.y - cardHeight - 20;

  return { x: posX, y: posY };
}
