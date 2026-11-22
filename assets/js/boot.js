// Sets the saved theme before first paint. A file, not inline, so the CSP can forbid inline scripts.
try {
  const t = localStorage.getItem('os.theme');
  if (t) document.documentElement.dataset.theme = t;
  else if (matchMedia('(prefers-color-scheme: dark)').matches) document.documentElement.dataset.theme = 'dark';
} catch (e) {}
