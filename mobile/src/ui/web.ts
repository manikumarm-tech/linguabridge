import { Platform } from 'react-native';

const web = Platform.OS === 'web';

/**
 * Web-only styling hooks: renders as data-* attributes that the global stylesheet below targets
 * (gradients, hover, entrance animations). On native it's a no-op, so screens keep solid colours.
 *   <View {...fx({ grad: 'primary', press: true })} />
 */
export const fx = (tags: Record<string, string | boolean | number | undefined>) => {
  if (!web) return {};
  const dataSet: Record<string, string> = {};
  for (const [k, v] of Object.entries(tags)) if (v !== undefined && v !== false) dataSet[k] = v === true ? '1' : String(v);
  return { dataSet } as any;
};

const CSS = `
html, body { background: #0b0d14; }
#root, #root * { font-family: 'Plus Jakarta Sans', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif !important; }
#root input, #root textarea { outline: none !important; }

[data-grad="primary"] { background-image: linear-gradient(135deg, #8B5CF6 0%, #D946EF 55%, #EC4899 100%) !important; }
[data-grad="mine"] { background-image: linear-gradient(135deg, #7C3AED 0%, #6366F1 100%) !important; border-color: transparent !important; }
[data-grad="soft"] { background-image: linear-gradient(135deg, rgba(139,92,246,.18), rgba(236,72,153,.12)) !important; }
[data-gradtext] { background-image: linear-gradient(90deg, #A78BFA, #F472B6 50%, #38BDF8); -webkit-background-clip: text; background-clip: text; color: transparent !important; }
[data-glow] { box-shadow: 0 10px 30px -8px rgba(168, 85, 247, .55); }
[data-shadow] { box-shadow: 0 6px 24px -10px rgba(0,0,0,.6); }

[data-press] { transition: transform .12s ease, filter .15s ease, background-color .15s ease, box-shadow .2s ease; cursor: pointer; }
[data-press]:hover { filter: brightness(1.08); }
[data-press]:active { transform: scale(.97); }

[data-row] { transition: background-color .15s ease; }
[data-row]:hover { background-color: rgba(255,255,255,.045); }
[data-rowaction] { opacity: 0; transition: opacity .15s ease; }
[data-row]:hover [data-rowaction] { opacity: .85; }
@media (hover: none) { [data-rowaction] { opacity: .6; } }

[data-focusring]:focus-within { box-shadow: 0 0 0 2px rgba(167,139,250,.55); }

[data-anim="in"] { animation: et-in .28s cubic-bezier(.2,.8,.2,1) both; }
@keyframes et-in { from { opacity: 0; transform: translateY(8px) scale(.985); } to { opacity: 1; transform: none; } }
[data-anim="pop"] { animation: et-popin .22s cubic-bezier(.2,.9,.3,1.3) both; }
@keyframes et-popin { from { opacity: 0; transform: scale(.6); } to { opacity: 1; transform: none; } }

[data-dot] { animation: et-dot 1.2s infinite ease-in-out; }
[data-dot="2"] { animation-delay: .15s; } [data-dot="3"] { animation-delay: .3s; }
@keyframes et-dot { 0%, 60%, 100% { transform: translateY(0); opacity: .45; } 30% { transform: translateY(-4px); opacity: 1; } }

::-webkit-scrollbar { width: 8px; height: 8px; }
::-webkit-scrollbar-thumb { background: rgba(255,255,255,.12); border-radius: 8px; }
::-webkit-scrollbar-track { background: transparent; }
@media (prefers-reduced-motion: reduce) { [data-anim], [data-dot] { animation: none !important; } }
`;

let injected = false;
/** Font + global stylesheet, once (web). */
export function injectWebStyles() {
  if (!web || injected || typeof document === 'undefined') return;
  injected = true;
  for (const href of ['https://fonts.googleapis.com', 'https://fonts.gstatic.com']) {
    const l = document.createElement('link');
    l.rel = 'preconnect'; l.href = href; if (href.includes('gstatic')) l.crossOrigin = '';
    document.head.appendChild(l);
  }
  const font = document.createElement('link');
  font.rel = 'stylesheet';
  font.href = 'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap';
  document.head.appendChild(font);
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
}
