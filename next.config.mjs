/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    serverActions: {
      // Invoices are capped at 10 MB by the upload route; keep body limits aligned.
      bodySizeLimit: "12mb",
    },
  },
  // Native / worker-heavy packages must stay external to the server bundle.
  serverExternalPackages: ["@libsql/client", "pdfjs-dist", "tesseract.js", "@napi-rs/canvas"],
};

export default nextConfig;
