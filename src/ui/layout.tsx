import type { FC, PropsWithChildren } from 'hono/jsx';
import { raw } from 'hono/html';

export type NavId = 'overview' | 'models' | 'providers' | 'usage';

/**
 * 16px outline icons, 1.5px stroke — the stroke settings live in app.css so the
 * four marks stay one family. The overview mark is the product's own shape: a
 * meter, three bars falling away.
 */
const ICONS: Record<NavId, string> = {
  overview: '<path d="M3 6h18M3 12h12M3 18h6"/>',
  models: '<path d="M12 3l9 5-9 5-9-5 9-5z"/><path d="M3 13l9 5 9-5"/>',
  providers:
    '<circle cx="12" cy="5" r="2.4"/><circle cx="5" cy="18" r="2.4"/><circle cx="19" cy="18" r="2.4"/><path d="M12 7.4v3.8M12 11.2L6.6 15.9M12 11.2l5.4 4.7"/>',
  usage: '<path d="M3 17l5-6 4 3 6-8"/>',
};

const NAV: Array<{ id: NavId; href: string; label: string }> = [
  { id: 'overview', href: '/', label: 'Overview' },
  { id: 'models', href: '/models', label: 'Models' },
  { id: 'providers', href: '/providers', label: 'Providers' },
  { id: 'usage', href: '/usage', label: 'Usage' },
];

const Icon: FC<{ id: NavId }> = ({ id }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    {raw(ICONS[id])}
  </svg>
);

export interface LayoutProps {
  title: string;
  active: NavId;
  /** Shown in the phone bar; the sidebar shows the full nav instead. */
  shortTitle: string;
  /** Providers with a 429 in the last hour, for the sidebar badge. */
  alerts?: number;
  children: unknown;
}

export const Layout: FC<LayoutProps> = (props) => (
  <>
    {raw('<!DOCTYPE html>')}
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{props.title} · Router</title>
        <meta name="color-scheme" content="light" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;700&family=Geist+Mono:wght@400;500&display=swap"
        />
        <link rel="stylesheet" href="/app.css" />
      </head>
      <body>
        <div class="shell">
          <aside class="sidebar" id="app-nav">
            <div class="brand">
              <svg class="brand-mark" viewBox="0 0 22 22" aria-hidden="true">
                <rect x="1" y="13" width="4" height="8" fill="currentColor" />
                <rect x="7" y="8" width="4" height="13" fill="currentColor" />
                <rect x="13" y="3" width="4" height="18" fill="currentColor" />
                <rect x="19" y="10" width="2" height="11" fill="#c3c8d0" />
              </svg>
              <span class="brand-name">Router</span>
            </div>
            <span class="brand-scope">personal free-tier gateway</span>

            <div class="nav-group">
              <span class="nav-label">Console</span>
              <nav class="nav" aria-label="Sections">
                {NAV.map((item) => (
                  <a
                    href={item.href}
                    aria-current={props.active === item.id ? 'page' : undefined}
                  >
                    <Icon id={item.id} />
                    {item.label}
                    {item.id === 'providers' && props.alerts ? (
                      <span class="nav-count">{props.alerts}</span>
                    ) : null}
                  </a>
                ))}
              </nav>
            </div>

            <div class="sidebar-foot">
              <span class="who">KIRA · own keys</span>
              <a class="btn btn-quiet btn-sm" href="/logout">
                Sign out
              </a>
            </div>
          </aside>

          <div class="main">
            <header class="phone-bar">
              <button class="pb-menu" type="button" aria-label="Open navigation" aria-expanded="false" data-menu>
                <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                  {raw('<path d="M4 7h16M4 12h16M4 17h16"/>')}
                </svg>
              </button>
              <span class="pb-title">{props.shortTitle}</span>
            </header>
            <main class="canvas">{props.children}</main>
          </div>
        </div>
        <script src="/charts.js" defer></script>
        <script src="/app.js" defer></script>
      </body>
    </html>
  </>
);
