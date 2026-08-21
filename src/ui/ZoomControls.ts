import { DEFAULT_LABELS } from '../config.js';
import type { ArgumentMapLabels } from '../types.js';

export interface ZoomControlsCallbacks {
  zoomIn: () => void;
  zoomOut: () => void;
  reset: () => void;
}

/** Vertical +/−/⤾ stack pinned to the bottom corner of the chart. */
export class ZoomControls {
  private element: HTMLElement;
  private inButton: HTMLButtonElement;
  private outButton: HTMLButtonElement;

  constructor(
    parent: HTMLElement,
    callbacks: ZoomControlsCallbacks,
    labels: ArgumentMapLabels = DEFAULT_LABELS,
  ) {
    this.element = document.createElement('div');
    this.element.className = 'pam-zoom-controls';
    this.element.setAttribute('role', 'group');
    this.element.setAttribute('aria-label', 'Zoom controls');

    this.inButton = this.makeButton('pam-zoom-controls__btn', '+', labels.zoomIn ?? 'Zoom in', callbacks.zoomIn);
    const resetButton = this.makeButton('pam-zoom-controls__btn', '⌂', labels.resetZoom ?? 'Reset view', callbacks.reset);
    this.outButton = this.makeButton('pam-zoom-controls__btn', '−', labels.zoomOutLabel ?? 'Zoom out', callbacks.zoomOut);

    this.element.append(this.inButton, resetButton, this.outButton);
    parent.appendChild(this.element);
  }

  setCanZoomOut(can: boolean): void {
    this.outButton.disabled = !can;
  }

  setVisible(visible: boolean): void {
    this.element.hidden = !visible;
  }

  destroy(): void {
    this.element.remove();
  }

  private makeButton(className: string, glyph: string, aria: string, onClick: () => void): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    button.textContent = glyph;
    button.setAttribute('aria-label', aria);
    button.title = aria;
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      onClick();
    });
    return button;
  }
}
