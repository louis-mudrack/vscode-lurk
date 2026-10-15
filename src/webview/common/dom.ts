type Child = Node | string | null | undefined | false;

interface ElementOptions {
  className?: string;
  text?: string;
  title?: string;
  attributes?: Record<string, string>;
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  options: ElementOptions = {},
  children: Child[] = [],
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (options.className) {
    element.className = options.className;
  }
  if (options.text !== undefined) {
    element.textContent = options.text;
  }
  if (options.title) {
    element.title = options.title;
  }
  for (const [name, value] of Object.entries(options.attributes ?? {})) {
    element.setAttribute(name, value);
  }
  for (const child of children) {
    if (child) {
      element.append(child);
    }
  }
  return element;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Builds an icon from SVG path data (24×24 viewBox) without using innerHTML. */
export function icon(pathData: string, className = 'icon'): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', className);
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', pathData);
  svg.append(path);
  return svg;
}
