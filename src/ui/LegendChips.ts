import type { ArgumentMapLabels } from '../types.js';

export interface LegendChipsOptions {
  labels: ArgumentMapLabels;
}

/** Bottom-corner color key: center / support / attack. */
export class LegendChips {
  private element: HTMLElement;

  constructor(parent: HTMLElement, options: LegendChipsOptions) {
    const { labels } = options;
    this.element = document.createElement('div');
    this.element.className = 'pam-legend';
    this.element.setAttribute('aria-hidden', 'true');

    this.chip('pam-legend__chip--center', labels.center);
    this.chip('pam-legend__chip--support', labels.support);
    this.chip('pam-legend__chip--attack', labels.attack);

    parent.appendChild(this.element);
  }

  private chip(colorClass: string, text: string): void {
    const chip = document.createElement('span');
    chip.className = `pam-legend__chip ${colorClass}`;
    const dot = document.createElement('i');
    dot.className = 'pam-legend__dot';
    chip.append(dot, document.createTextNode(text));
    this.element.append(chip);
  }

  setVisible(visible: boolean): void {
    this.element.hidden = !visible;
  }

  destroy(): void {
    this.element.remove();
  }
}
