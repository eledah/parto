import { DEFAULT_LABELS } from '../config.js';
import type { ArgumentMapLabels, TooltipRenderer, TreeNode } from '../types.js';
import { clampTooltipPosition } from './tooltipPosition.js';

function typeLabel(
  node: TreeNode,
  labels: ArgumentMapLabels,
): { text: string; className: string } {
  if (node.type === 'thesis') return { text: labels.center, className: 'center' };
  if (node.relationType === 'attack') return { text: labels.attack, className: 'attack' };
  if (node.relationType === 'support') return { text: labels.support, className: 'support' };
  return { text: labels.claim, className: 'claim' };
}

export function createDefaultTooltip(
  node: TreeNode,
  labels: ArgumentMapLabels = DEFAULT_LABELS,
): HTMLElement {
  const card = document.createElement('div');
  card.className = 'pam-tooltip';

  const header = document.createElement('div');
  header.className = 'pam-tooltip__header';

  const type = typeLabel(node, labels);
  const typeEl = document.createElement('span');
  typeEl.className = `pam-tooltip__type pam-tooltip__type--${type.className}`;
  typeEl.textContent = type.text;

  const speakerEl = document.createElement('span');
  speakerEl.className = 'pam-tooltip__speaker';
  speakerEl.textContent = node.speaker || labels.unknownSpeaker;

  header.append(typeEl, speakerEl);

  const title = document.createElement('h3');
  title.className = 'pam-tooltip__title';
  title.textContent = node.title;

  card.append(header, title);

  if (node.description) {
    const desc = document.createElement('p');
    desc.className = 'pam-tooltip__description';
    desc.textContent = node.description;
    card.append(desc);
  }

  if (node.relationType && node.relationReasoning) {
    const reasoning = document.createElement('p');
    reasoning.className = 'pam-tooltip__reasoning';
    reasoning.textContent = node.relationReasoning;
    card.append(reasoning);
  }

  if (node.quote) {
    const quote = document.createElement('blockquote');
    quote.className = 'pam-tooltip__quote';
    quote.textContent = `"${node.quote}"`;
    card.append(quote);
  }

  if (node.score) {
    const scores = document.createElement('div');
    scores.className = 'pam-tooltip__scores';
    const intensity = document.createElement('span');
    intensity.textContent = `${labels.intensity}: ${Math.round(node.score.intensity * 100)}%`;
    const confidence = document.createElement('span');
    confidence.textContent = `${labels.confidence}: ${Math.round(node.score.confidence * 100)}%`;
    scores.append(intensity, confidence);
    card.append(scores);
  }

  return card;
}

type TooltipEvent = MouseEvent | FocusEvent | PointerEvent;

function readPointer(event: TooltipEvent): { x: number; y: number; pointerType?: string } {
  if ('clientX' in event && typeof event.clientX === 'number') {
    const pointerType = 'pointerType' in event ? event.pointerType : undefined;
    return { x: event.clientX, y: event.clientY, pointerType };
  }
  return { x: 0, y: 0 };
}

export class TooltipController {
  private element: HTMLDivElement;
  private rafId: number | null = null;
  private position = { x: 0, y: 0 };
  private pointerType: string | undefined;
  private renderer: TooltipRenderer;
  private labels: ArgumentMapLabels;
  private visible = false;

  constructor(
    parent: HTMLElement,
    id: string,
    renderer: TooltipRenderer,
    labels: ArgumentMapLabels,
  ) {
    this.renderer = renderer;
    this.labels = labels;
    this.element = document.createElement('div');
    this.element.id = id;
    this.element.className = 'pam-tooltip-host';
    this.element.setAttribute('role', 'region');
    this.element.setAttribute('aria-live', 'polite');
    parent.appendChild(this.element);
  }

  show(node: TreeNode, event: TooltipEvent): void {
    const pointer = readPointer(event);
    this.position = { x: pointer.x, y: pointer.y };
    this.pointerType = pointer.pointerType;
    this.element.replaceChildren(this.renderer(node, this.labels));
    this.element.classList.toggle('pam-tooltip-host--touch', pointer.pointerType === 'touch');
    this.element.classList.add('pam-tooltip-host--visible');
    this.visible = true;
    this.schedulePosition();
  }

  move(event: PointerEvent): void {
    if (!this.visible) return;
    this.position = { x: event.clientX, y: event.clientY };
    this.pointerType = event.pointerType;
    this.element.classList.toggle('pam-tooltip-host--touch', event.pointerType === 'touch');
    this.schedulePosition();
  }

  hide(): void {
    this.visible = false;
    this.pointerType = undefined;
    this.element.classList.remove('pam-tooltip-host--visible', 'pam-tooltip-host--touch');
    this.element.replaceChildren();
    if (this.rafId != null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  setLabels(labels: ArgumentMapLabels): void {
    this.labels = labels;
  }

  destroy(): void {
    this.hide();
    this.element.remove();
  }

  private schedulePosition(): void {
    if (this.rafId != null) cancelAnimationFrame(this.rafId);
    this.rafId = requestAnimationFrame(() => {
      const tooltip = this.element.firstElementChild as HTMLElement | null;
      if (!tooltip) return;
      const { x, y } = clampTooltipPosition(this.position, tooltip, this.pointerType);
      this.element.style.left = `${x}px`;
      this.element.style.top = `${y}px`;
    });
  }
}
