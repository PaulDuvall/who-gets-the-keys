// Playwright for this kit comes from the walkthrough's pinned package in video/record, so the
// factory video adds no dependency of its own. Outside CI, where video/record has no
// node_modules, it falls back to a Playwright the machine already provides.
import { createRequire } from 'node:module';

const pinned = createRequire(new URL('../video/record/package.json', import.meta.url));
let playwright;
try {
  playwright = pinned('playwright');
} catch {
  playwright = createRequire(import.meta.url)('playwright');
}

export const { chromium } = playwright;
