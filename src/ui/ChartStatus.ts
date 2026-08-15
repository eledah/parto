export type ChartStatusState = 'loading' | 'empty' | 'error' | null;

export interface ChartStatusMessages {
  loading: string;
  empty: string;
  error: string;
}

export class ChartStatusOverlay {
  private element: HTMLDivElement;
  private messages: ChartStatusMessages;
  private state: ChartStatusState = null;

  constructor(parent: HTMLElement, messages: ChartStatusMessages) {
    this.messages = messages;

    this.element = document.createElement('div');
    this.element.className = 'pam-chart__status';
    this.element.setAttribute('role', 'status');
    this.element.setAttribute('aria-live', 'polite');
    this.element.hidden = true;
    parent.appendChild(this.element);
  }

  show(state: Exclude<ChartStatusState, null>, message?: string): void {
    this.state = state;
    this.element.hidden = false;
    this.element.className = `pam-chart__status pam-chart__status--${state}`;

    const text = message ?? this.messages[state];
    this.element.replaceChildren();
    const label = document.createElement('p');
    label.className = 'pam-chart__status-text';
    label.textContent = text;
    this.element.append(label);

    if (state === 'loading') {
      const spinner = document.createElement('span');
      spinner.className = 'pam-chart__status-spinner';
      spinner.setAttribute('aria-hidden', 'true');
      this.element.prepend(spinner);
    }
  }

  hide(): void {
    this.state = null;
    this.element.hidden = true;
    this.element.replaceChildren();
    this.element.className = 'pam-chart__status';
  }

  isVisible(): boolean {
    return this.state !== null;
  }

  getState(): ChartStatusState {
    return this.state;
  }

  destroy(): void {
    this.element.remove();
  }
}
