const assert = require('node:assert/strict');
const { setTimeout: delay } = require('node:timers/promises');

// Run against the built app's DOM and IPC, so parse failures, broken controls
// and missing packaged workers cannot hide behind a successful window launch.
async function checkWindow(window, { server, switchServer, version, rendererErrors, receiver }) {
  const evaluate = code => window.webContents.executeJavaScript(code, true);
  async function waitFor(code, label) {
    const deadline = Date.now() + 10000;
    while (!await evaluate(code)) {
      if (rendererErrors.length) throw new Error(rendererErrors.join('\n'));
      if (Date.now() > deadline) throw new Error(`Timed out waiting for ${label}`);
      await delay(50);
    }
  }
  await waitFor('document.documentElement.dataset.ready === "true"', 'renderer startup');
  assert.equal(await evaluate('typeof window.electronAPI'), 'object');
  assert.equal(await evaluate('typeof window.handleConnectBtnClick'), 'function');
  const fonts = await evaluate(`Promise.all([
    document.fonts.load('16px "Material Icons"'), document.fonts.load('16px "DSEG14"'),
    document.fonts.load('700 16px "DSEG14"')]).then(results => results.every(items => items.length > 0))`);
  assert.equal(fonts, true);
  assert.equal(await evaluate('document.getElementById("server-dialog").open'), true);
  await evaluate(`document.getElementById('manual-server-url').value = ${JSON.stringify(server)};
    document.getElementById('connect-manual-btn').click()`);
  await waitFor(`document.getElementById('connection-status').textContent === 'Connected'
    && document.getElementById('freq-input').value === '98.500'`, 'connection and tuner snapshot');
  await waitFor(`document.getElementById('ant-btn').textContent.includes('Roof')`, 'metadata');
  await waitFor(`document.getElementById('rds-adv').textContent.includes('ABCD')`, 'packaged RDS worker');
  assert.ok(receiver.rdsWorker);
  assert.equal(await evaluate(`document.querySelector('script:not([src])') !== null`), false);
  assert.equal(await evaluate(`document.getElementById('eq-btn').classList.contains('active')`), false);
  await evaluate(`document.getElementById('freq-input').value = 'Infinity';
    document.getElementById('freq-input').dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter'}))`);
  assert.match(await evaluate(`document.getElementById('server-error').textContent`), /frequency/i);
  await evaluate(`document.getElementById('freq-input').value = '995';
    document.getElementById('freq-input').dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter'}))`);
  await waitFor('Number(document.getElementById("freq-input").value) === 99.5', 'validated tuning');
  await evaluate(`document.getElementById('bandwidth-select').value = '72000';
    document.getElementById('bandwidth-select').dispatchEvent(new Event('change'));
    document.getElementById('stereo-btn').click(); document.getElementById('eq-btn').click();
    document.getElementById('ant-btn').click()`);
  await waitFor(`document.getElementById('ant-btn').textContent.includes('Garden')`, 'tuner controls');
  await evaluate(`document.getElementById('volume-control').value = '0';
    document.getElementById('volume-control').dispatchEvent(new Event('input'));
    document.getElementById('play-btn').click()`);
  await waitFor(`!document.getElementById('lcd-buffer').classList.contains('dim')
    && document.getElementById('lcd-buffer').textContent.includes('%')`, 'decoded MP3 playback');
  await evaluate(`document.activeElement.blur();
    document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true, cancelable: true}))`);
  assert.equal(await evaluate('document.getElementById("server-dialog").open'), true);
  await evaluate(`document.getElementById('manual-server-url').value = ${JSON.stringify(switchServer)};
    document.getElementById('connect-manual-btn').click()`);
  await waitFor(`document.getElementById('connection-status').textContent === 'Connected'
    && document.getElementById('url-input').value === ${JSON.stringify(switchServer)}`, 'server switch');
  await waitFor(`document.getElementById('server-select').textContent.includes('Second tuner')`, 'switched metadata');
  const metadataDeadline = Date.now() + 10000;
  while (receiver.tunerInfo.tunerName !== 'Second tuner') {
    if (Date.now() > metadataDeadline) throw new Error('Switched metadata timeout');
    await delay(50);
  }
  assert.equal(receiver.settings.load().recentServers.length, 2);
  await evaluate(`document.getElementById('url-btn').click()`);
  await waitFor('document.getElementById("connection-status").textContent === "Disconnected"', 'disconnect');
  assert.equal(receiver._intervals.size, 0);
  assert.equal(receiver.rdsWorker, null);
  assert.equal(receiver.plugin, null);
  assert.deepEqual(rendererErrors, []);
  return { version, fonts, connected: true, tuning: true, controls: true, rdsWorker: true,
    audio: true, selector: true, switching: true, disconnected: true, rendererErrors };
}
module.exports = { checkWindow };
