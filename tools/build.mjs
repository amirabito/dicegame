// Builds Tailwind CSS and Font Awesome icons directly into target-ninja.html,
// so the game works on school networks that block outside CDNs.
//
// Usage (from this folder):
//   npm install
//   npm run build
//
// Edit target-ninja.html as normal, then re-run the build. It only rewrites the
// text between the TAILWIND:START/END and ICONS:START/END markers.

import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import * as solid from '@fortawesome/free-solid-svg-icons';
import * as regular from '@fortawesome/free-regular-svg-icons';

const here = dirname(fileURLToPath(import.meta.url));
const file = join(here, '..', process.argv[2] || 'target-ninja.html');

const tailwindConfig = {
  theme: {
    extend: {
      fontFamily: {
        display: ['Fredoka', 'ui-rounded', 'system-ui', 'sans-serif'],
        body: ['Plus Jakarta Sans', 'system-ui', 'sans-serif'],
      },
      colors: {
        turtle: {
          50: '#f0fdf4',
          100: '#dcfce7',
          200: '#bbf7d0',
          300: '#86efac',
          400: '#4ade80',
          500: '#22c55e',
          600: '#16a34a',
          700: '#15803d',
          800: '#166534',
          900: '#14532d',
          950: '#052e16',
        },
        ninja: {
          blue: '#38bdf8',
          red: '#f43f5e',
          purple: '#c084fc',
          orange: '#fb923c',
          slime: '#a3e635',
          sewer: '#0f172a',
          dojo: '#1e293b',
        },
      },
      animation: {
        pop: 'pop 0.3s ease-out forwards',
        'spin-slow': 'spin 8s linear infinite',
      },
      keyframes: {
        pop: {
          '0%': { transform: 'scale(0.85)', opacity: '0' },
          '70%': { transform: 'scale(1.05)' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
      },
    },
  },
};

const CSS_RE = /(\/\* TAILWIND:START \*\/)[\s\S]*?(\/\* TAILWIND:END \*\/)/;
const ICON_RE = /(\/\* ICONS:START \*\/)[\s\S]*?(\/\* ICONS:END \*\/)/;

let html = readFileSync(file, 'utf8');
if (!CSS_RE.test(html) || !ICON_RE.test(html)) {
  throw new Error('Could not find the TAILWIND or ICONS markers in ' + file);
}

// Scan the page without the previously generated blocks
const source = html.replace(CSS_RE, '$1$2').replace(ICON_RE, '$1$2');

// --- Icons: collect every "fa-solid fa-name" / "fa-regular fa-name" used ---
const icons = {};
for (const [, style, name] of source.matchAll(/fa-(solid|regular) fa-([a-z0-9-]+)/g)) {
  const key = `${style}:${name}`;
  if (icons[key]) continue;
  const exportName = 'fa' + name.split('-').map(s => s[0].toUpperCase() + s.slice(1)).join('');
  const def = (style === 'solid' ? solid : regular)[exportName];
  if (!def) throw new Error(`Unknown Font Awesome icon: ${key}`);
  const [w, h, , , path] = def.icon;
  icons[key] = [w, h, Array.isArray(path) ? path.join(' ') : path];
}

// --- Tailwind: compile only the classes the page uses ---
const dir = mkdtempSync(join(tmpdir(), 'target-ninja-'));
try {
  const contentPath = join(dir, 'content.html');
  const inputPath = join(dir, 'in.css');
  const outputPath = join(dir, 'out.css');
  const configPath = join(dir, 'tailwind.config.cjs');
  writeFileSync(contentPath, source);
  writeFileSync(inputPath, '@tailwind base;\n@tailwind components;\n@tailwind utilities;\n');
  writeFileSync(configPath, `module.exports = ${JSON.stringify({ ...tailwindConfig, content: [contentPath] }, null, 2)};\n`);
  execFileSync(join(here, 'node_modules', '.bin', 'tailwindcss'),
    ['-c', configPath, '-i', inputPath, '-o', outputPath, '--minify'],
    { stdio: 'inherit' });
  const css = readFileSync(outputPath, 'utf8').trim();

  html = html
    .replace(CSS_RE, (_, start, end) => `${start}\n${css}\n${end}`)
    .replace(ICON_RE, (_, start, end) =>
      `${start}\n    // Font Awesome Free 6.4.0 by @fontawesome - https://fontawesome.com (Icons: CC BY 4.0 License)\n` +
      `    const ICONS = ${JSON.stringify(icons)};\n    ${end}`);
  writeFileSync(file, html);
  console.log(`Built ${file}: ${css.length.toLocaleString()} bytes of CSS, ${Object.keys(icons).length} icons`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
