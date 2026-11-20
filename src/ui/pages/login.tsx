import type { FC } from 'hono/jsx';
import { raw } from 'hono/html';

/**
 * The one screen outside the console. No sidebar, no nav, one field: this gate
 * exists so an open dashboard does not burn the free tier on somebody else's
 * traffic.
 */
export const Login: FC<{ error?: string }> = ({ error }) => (
  <>
    {raw('<!DOCTYPE html>')}
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Sign in · Router</title>
        <meta name="color-scheme" content="light" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;700&family=Geist+Mono:wght@400;500&display=swap"
        />
        <link rel="stylesheet" href="/app.css" />
      </head>
      <body class="gate">
        <main class="gate-card">
          <div class="brand gate-brand">
            <svg class="brand-mark" viewBox="0 0 22 22" aria-hidden="true">
              <rect x="1" y="13" width="4" height="8" fill="currentColor" />
              <rect x="7" y="8" width="4" height="13" fill="currentColor" />
              <rect x="13" y="3" width="4" height="18" fill="currentColor" />
              <rect x="19" y="10" width="2" height="11" fill="#c3c8d0" />
            </svg>
            <span class="brand-name">Router</span>
          </div>

          <h1>Sign in</h1>
          <p class="sub">
            The console is password-gated. It reads the same value as{' '}
            <span class="mono">DASHBOARD_PASSWORD</span>.
          </p>

          <form method="post" action="/login">
            <div class="field">
              <label for="password">Password</label>
              <input
                id="password"
                name="password"
                type="password"
                autocomplete="current-password"
                required
                autofocus
                aria-describedby={error ? 'login-error' : undefined}
              />
            </div>
            {error ? (
              <p class="err" id="login-error" role="alert">
                {error}
              </p>
            ) : null}
            <button class="btn btn-primary" type="submit">
              Sign in
            </button>
          </form>
        </main>
      </body>
    </html>
  </>
);
