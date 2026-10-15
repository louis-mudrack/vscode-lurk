import { el, icon } from '../../common/dom';

export interface StatusScreenOptions {
  title: string;
  detail?: string;
  avatarUrl?: string;
  iconPath?: string;
  busy?: boolean;
  actions?: HTMLElement[];
  body?: HTMLElement;
  footer?: HTMLElement;
}

/** Centered message used for the idle, loading, offline and error states. */
export function createStatusScreen(options: StatusScreenOptions): HTMLElement {
  let visual: HTMLElement | SVGSVGElement | null = null;
  if (options.busy) {
    visual = el('div', { className: 'spinner', attributes: { role: 'progressbar' } });
  } else if (options.avatarUrl) {
    visual = el('img', {
      className: 'avatar avatar-large',
      attributes: { src: options.avatarUrl, alt: '' },
    });
  } else if (options.iconPath) {
    visual = icon(options.iconPath, 'icon icon-hero');
  }
  return el('section', { className: 'status-screen' }, [
    visual,
    el('h2', { className: 'status-title', text: options.title }),
    options.detail ? el('p', { className: 'status-detail', text: options.detail }) : null,
    options.actions?.length ? el('div', { className: 'status-actions' }, options.actions) : null,
    options.body,
    options.footer,
  ]);
}

export function textButton(label: string, onClick: () => void, primary = false): HTMLButtonElement {
  const button = el('button', {
    className: primary ? 'primary-button' : 'secondary-button',
    text: label,
    attributes: { type: 'button' },
  });
  button.addEventListener('click', onClick);
  return button;
}
