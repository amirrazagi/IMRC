const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync('public/index.html', 'utf8');
const js = fs.readFileSync('public/panel.js', 'utf8');
const css = fs.readFileSync('public/panel.css', 'utf8');

test('tools page: filter, suggested/most-used chips, card IDs and guides present', () => {
  for (const id of ['toolFilter', 'toolSuggest', 'toolUsed',
    'tool-ping', 'tool-net', 'tool-cfg', 'tool-sen', 'tool-react', 'tool-check', 'tool-notes']) {
    assert.match(html, new RegExp('id="' + id + '"'), 'missing ' + id);
  }
  assert.match(js, /function trackTool\(id\)/);
  assert.match(js, /const TOOLS = \[/);
  assert.match(js, /const GUIDES = \{/);
  assert.match(js, /function renderToolsToolbar\(\)/);
  assert.match(js, /TOOL_RUN = \{/);
  assert.match(css, /\.tools-toolbar/);
  assert.match(css, /\.tool-guide/);
  for (const act of ['runTool', 'toolGuide', 'toolHide']) {
    assert.match(js, new RegExp(act + ':'), 'missing action ' + act);
  }
});

test('what\'s new page and nav entry', () => {
  assert.match(html, /id="page-whatsnew"/);
  assert.match(html, /id="whatsNewBadge"/);
  assert.match(js, /whatsnew: "قابلیت‌های جدید"/);
  assert.match(js, /function markWhatsNewSeen/);
  assert.match(js, /whatsNewSeen: \(\) => markWhatsNewSeen/);
});

test('settings: tools customization + experimental lab + extended workspace backup', () => {
  assert.match(html, /id="toolCustomize"/);
  assert.match(html, /id="tgLab"/);
  assert.match(html, /مختبر \(آزمایشی\)/);
  assert.match(js, /IMRC_toolLayout/);
  assert.match(js, /IMRC_labEnabled/);
  assert.match(js, /toolUse: store\.get\("IMRC_toolUse"/);
  assert.match(js, /toolHist: store\.get\("IMRC_toolHist"/);
  assert.match(js, /store\.set\("IMRC_toolUse", d\.toolUse\)/);
  assert.match(js, /store\.set\("IMRC_labEnabled", d\.labEnabled\)/);
  assert.match(html, /خروجی Workspace/);
  assert.match(html, /واردکردن Workspace/);
});

test('tools usage tracked in the five main tool functions', () => {
  assert.match(js, /function pingRun\(\)\s*\{\s*trackTool\("ping"\)/);
  assert.match(js, /function netInfo\(\)\s*\{\s*trackTool\("net"\)/);
  assert.match(js, /function cfgRun\(\)\s*\{\s*trackTool\("cfg"\)/);
  assert.match(js, /function senRun\(\)\s*\{\s*trackTool\("sen"\)/);
  assert.match(js, /function reactClick\(\)\s*\{\s*trackTool\("react"\)/);
});
