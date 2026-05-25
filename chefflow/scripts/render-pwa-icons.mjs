// One-off PNG renderer for the PWA chef-hat icons. Run from chefflow/:
//   node scripts/render-pwa-icons.mjs
// Requires @resvg/resvg-js (installed locally; not a runtime dep).
import { readFileSync, writeFileSync } from 'node:fs';
import { Resvg } from '@resvg/resvg-js';

const svg = readFileSync('public/icon-chef-hat.svg');
for (const size of [180, 192, 512]) {
  const r = new Resvg(svg, { fitTo: { mode: 'width', value: size } });
  writeFileSync(`public/icon-chef-hat-${size}.png`, r.render().asPng());
  console.log(`wrote icon-chef-hat-${size}.png`);
}
