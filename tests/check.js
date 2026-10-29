'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'notas.html'), 'utf8');
const backend = fs.readFileSync(path.join(root, 'app script.txt'), 'utf8');
const match = html.match(/<script>([\s\S]*?)<\/script>/i);
assert.ok(match, 'Falta el script principal de notas.html');
new vm.Script(match[1], { filename: 'notas.html' });
new vm.Script(backend, { filename: 'app script.txt' });
new vm.Script(fs.readFileSync(path.join(root, 'sw.js'), 'utf8'), { filename: 'sw.js' });
// La distribución responsive ahora cambia deliberadamente el orden visual.
 // En lugar de bloquear todo cambio de marcado con un hash, comprobamos
 // la integridad de los controles y que las barras no queden ancladas.
const requiredIds = ['search','catFilter','sort','uiBottomNav','uiAddDock','newNote',
  'syncPanel','syncSummary','uiChips','notesList','pinnedList','uiCategoriesPage',
  'uiCategorySheet','catDialog','noteDialog','recoveryDialog','toast'];
for (const id of requiredIds) {
  const count = html.split('id="' + id + '"').length - 1;
  assert.equal(count, 1, 'Falta o está duplicado el control ' + id);
}
const mainIndex = html.indexOf('<main class="list"');
assert.ok(mainIndex > html.indexOf('id="uiBottomNav"'), 'La navegación debe preceder a las notas');
assert.ok(mainIndex > html.indexOf('id="uiAddDock"'), 'Nueva nota debe preceder a las tarjetas');
const styles = [...html.matchAll(/<style(?:\s[^>]*)?>([\s\S]*?)<\/style>/g)].map(m => m[1]).join('\n');
assert.doesNotMatch(styles, /position:\s*(?:fixed|sticky)\b/i, 'No debe haber barras inmovilizadas');
assert.match(html, /function apiSaveAll_\(state\)/, 'Falta guardado remoto');
assert.match(html, /function stagePending_\(\)/, 'Falta respaldo de cambios');
assert.match(html, /function startAutoSync\(\)/, 'Falta sincronización');
assert.match(html, /function importFile\(file\)/, 'Falta importación');
assert.match(backend, /requestId/, 'Falta correlación de guardados');
console.log('OK: HTML y Apps Script compilan; funciones esenciales presentes.');

