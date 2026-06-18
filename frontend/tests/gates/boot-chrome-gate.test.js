import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../../');
const HTML = readFileSync(resolve(ROOT, 'index.html'), 'utf8');

describe('boot chrome (index.html shipped <head>)', () => {
  it('links a favicon', () => {
    expect(/<link[^>]+rel=["']icon["'][^>]*>/.test(HTML)).toBe(true);
  });
  it('links a PWA web manifest', () => {
    expect(/<link[^>]+rel=["']manifest["'][^>]*>/.test(HTML)).toBe(true);
    expect(existsSync(resolve(ROOT, 'public/manifest.webmanifest'))).toBe(true);
  });
  it('links an apple-touch-icon', () => {
    expect(/<link[^>]+rel=["']apple-touch-icon["'][^>]*>/.test(HTML)).toBe(true);
  });
  it('declares a theme-color', () => {
    expect(/<meta[^>]+name=["']theme-color["'][^>]*>/.test(HTML)).toBe(true);
  });
  it('declares Open Graph + Twitter card meta', () => {
    expect(/property=["']og:title["']/.test(HTML)).toBe(true);
    expect(/property=["']og:description["']/.test(HTML)).toBe(true);
    expect(/name=["']twitter:card["']/.test(HTML)).toBe(true);
  });
  it('ships the favicon asset', () => {
    expect(existsSync(resolve(ROOT, 'public/favicon.svg'))).toBe(true);
  });
  it('contains NO trademark-risk "Minecraft" copy', () => {
    expect(/minecraft/i.test(HTML)).toBe(false);
  });
});
