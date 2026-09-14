# Security policy

## Reporting a vulnerability

Please report vulnerabilities privately through the repository host's security-advisory feature. Do not include private notes, real workspace exports, credentials, or personally identifying data in a report. A minimal synthetic reproduction is preferred.

As a preview project, no response-time commitment is currently offered. Valid reports will be assessed before public disclosure.

## Data and trust boundaries

PowerMind is local-first:

- It has no account system, analytics, telemetry, advertising, or application-level network synchronization.
- Chrome and Edge may write to a folder explicitly selected by the user.
- Browsers without direct folder access store data in origin-scoped IndexedDB.
- Imported JSON, rich text, image data, filenames, identifiers, colors, and mind-map relationships are untrusted input and must remain sanitized.

Browser storage can still be cleared by the user, browser, operating system, or site-data policy. Users should export backups regularly.

## Hosting recommendations

Serve production deployments over HTTPS and configure headers at the web server or hosting platform. Test changes before enforcing a policy. A suitable starting point is:

```text
Content-Security-Policy: default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()
Referrer-Policy: no-referrer
X-Content-Type-Options: nosniff
```

The current inline bootstrap and SVG symbols require the indicated inline allowances. Removing those allowances requires moving inline script and style attributes into static assets first.
