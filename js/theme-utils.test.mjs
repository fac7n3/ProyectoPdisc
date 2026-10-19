import assert from 'node:assert/strict';
import { THEME_KEY, normalizeTheme, nextTheme, themeToggleLabel } from './theme-utils.js';

assert.equal(THEME_KEY, 'bl_theme');
assert.equal(normalizeTheme('dark'), 'dark');
assert.equal(normalizeTheme('light'), 'light');
assert.equal(normalizeTheme('auto'), null);
assert.equal(normalizeTheme(null), null);
assert.equal(normalizeTheme(undefined), null);
assert.equal(nextTheme('light'), 'dark');
assert.equal(nextTheme('dark'), 'light');
assert.equal(themeToggleLabel('light'), 'Cambiar a modo oscuro');
assert.equal(themeToggleLabel('dark'), 'Cambiar a modo claro');
console.log('theme-utils: ok');
