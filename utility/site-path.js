// Next Link prefixes routes automatically; public assets and native anchors need it explicitly.
export const sitePath = (path) => {
  const base = process.env.NEXT_PUBLIC_BASE_PATH || '';
  if (!base || !path?.startsWith('/') || path.startsWith('//')
    || path === base || path.startsWith(`${base}/`)) return path;
  return `${base}${path}`;
};
