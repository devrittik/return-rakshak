/**
 * Response headers for every route.
 *
 * script-src allows inline scripts because the theme snippet in the root
 * layout, and Next's own bootstrap, are inline. There is no third-party
 * script origin. unsafe-eval is added only in development, where the
 * dev server uses it for refresh. Production does not.
 */
export function securityHeaders(dev) {
  const scriptSrc = dev ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'" : "script-src 'self' 'unsafe-inline'";
  const connectSrc = dev ? "connect-src 'self' ws: wss:" : "connect-src 'self'";

  return [
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "no-referrer" },
    { key: "X-DNS-Prefetch-Control", value: "off" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
    {
      key: "Content-Security-Policy",
      value: [
        "default-src 'self'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'none'",
        "object-src 'none'",
        "img-src 'self' data: blob:",
        "style-src 'self' 'unsafe-inline'",
        scriptSrc,
        connectSrc,
      ].join("; "),
    },
  ];
}
