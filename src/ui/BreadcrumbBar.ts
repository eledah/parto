import type { NodeContext } from '../types.js';

export interface BreadcrumbBarOptions {
  /** Called with the path prefix (root..clicked crumb) when a crumb is activated. */
  onNavigate: (path: NodeContext[]) => void;
}

const MAX_VISIBLE_CRUMBS = 4;

/**
 * Clickable trail of the current zoom focus, rendered inside the chart
 * container. Uses logical CSS properties so RTL containers mirror it for free.
 */
export class BreadcrumbBar {
  private element: HTMLElement;
  private homeButton: HTMLButtonElement;
  private ellipsis: HTMLSpanElement;
  private crumbs: HTMLSpanElement;
  private currentPath: NodeContext[] = [];
  private options: BreadcrumbBarOptions;
  private widthVisible = true;

  constructor(parent: HTMLElement, options: BreadcrumbBarOptions) {
    this.options = options;

    this.element = document.createElement('nav');
    this.element.className = 'pam-breadcrumbs';
    this.element.setAttribute('aria-label', 'Zoom path');

    this.homeButton = document.createElement('button');
    this.homeButton.type = 'button';
    this.homeButton.className = 'pam-breadcrumbs__crumb';

    this.ellipsis = document.createElement('span');
    this.ellipsis.className = 'pam-breadcrumbs__ellipsis';
    this.ellipsis.textContent = '…';
    this.ellipsis.hidden = true;

    this.crumbs = document.createElement('span');
    this.crumbs.className = 'pam-breadcrumbs__crumbs';

    this.element.append(this.homeButton, this.ellipsis, this.crumbs);
    this.homeButton.addEventListener('click', () => {
      if (this.currentPath.length > 1) {
        this.options.onNavigate(this.currentPath.slice(0, 1));
      }
    });
    this.update([]);
    parent.appendChild(this.element);
  }

  update(path: NodeContext[]): void {
    if (this.currentPath.length === 0 && path.length === 0) return;
    this.currentPath = [...path];
    this.applyVisibility();
    const rootTitle = path[0]?.title ?? 'Root';

    this.homeButton.textContent = rootTitle;
    this.homeButton.setAttribute('aria-label', `Zoom out to ${rootTitle}`);
    this.syncCrumb(this.homeButton, 0);

    // Long trails collapse to: root … second-to-last, last.
    const tailStart = path.length > MAX_VISIBLE_CRUMBS ? path.length - 2 : 1;
    this.ellipsis.hidden = tailStart <= 1;

    this.crumbs.replaceChildren();
    for (let i = tailStart; i < path.length; i++) {
      const context = path[i]!;
      if (i > tailStart) {
        const separator = document.createElement('span');
        separator.className = 'pam-breadcrumbs__sep';
        separator.textContent = '/';
        separator.setAttribute('aria-hidden', 'true');
        this.crumbs.append(separator);
      }
      const crumb = document.createElement('button');
      crumb.type = 'button';
      crumb.className = 'pam-breadcrumbs__crumb';
      crumb.textContent = context.title;
      this.syncCrumb(crumb, i);
      crumb.addEventListener('click', () => {
        this.options.onNavigate(this.currentPath.slice(0, i + 1));
      });
      this.crumbs.append(crumb);
    }
  }

  setVisible(visible: boolean): void {
    this.widthVisible = visible;
    this.applyVisibility();
  }

  destroy(): void {
    this.element.remove();
  }

  private applyVisibility(): void {
    this.element.hidden = !this.widthVisible || this.currentPath.length === 0;
  }

  private syncCrumb(button: HTMLButtonElement, index: number): void {
    const isLast = index === this.currentPath.length - 1;
    button.disabled = isLast;
    if (isLast) {
      button.setAttribute('aria-current', 'location');
    } else {
      button.removeAttribute('aria-current');
    }
  }
}
