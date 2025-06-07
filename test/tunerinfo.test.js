const assert = require('assert');
const Module = require('module');

let calledUrl;
let axiosBehavior;
const axiosStub = {
  get: async (url) => {
    calledUrl = url;
    return axiosBehavior(url);
  }
};

let cheerioBehavior;
const cheerioStub = {
  load: (html) => cheerioBehavior(html)
};

function makeCheerio(html) {
  return (selector) => {
    if (typeof selector === 'object' && selector.text) {
      return { text: selector.text };
    }
    if (selector === '#data-ant ul.options li, #data-ant li') {
      const matches = [...html.matchAll(/<li[^>]*>(.*?)<\/li>/g)].map(m => m[1]);
      return {
        each: cb => matches.forEach((t, i) => cb(i, { text: () => t })),
        length: matches.length,
        attr: () => undefined
      };
    }
    if (selector === '#data-ant input') {
      const m = html.match(/<input[^>]*placeholder="([^"]*)"/);
      return {
        attr: (name) => (name === 'placeholder' && m ? m[1] : undefined)
      };
    }
    if (selector === '#data-ant-container') {
      return { length: html.includes('data-ant-container') ? 1 : 0 };
    }
    return {
      attr: () => '',
      each: () => {},
      length: 0
    };
  };
}

const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === 'axios') return axiosStub;
  if (request === 'cheerio') return cheerioStub;
  return originalLoad(request, parent, isMain);
};

const { getPingTime, getTunerInfo } = require('../tunerinfo');

(async () => {
  axiosBehavior = () => ({ status: 200 });
  await getPingTime('http://example.com/');
  assert.strictEqual(calledUrl, 'http://example.com/ping');

  await getPingTime('http://example.com/dir');
  assert.strictEqual(calledUrl, 'http://example.com/dir/ping');

  // Scenario 1: static data with HTML antenna list
  const htmlMulti = '<div id="data-ant"><input placeholder="Ant B"><ul class="options"><li data-value="0">VER</li><li data-value="1">HOR</li></ul></div>';
  axiosBehavior = (url) => {
    if (url.endsWith('/static_data')) {
      return {
        data: {
          tunerName: 'Test',
          tunerDesc: 'Desc',
          antSel: 2
        }
      };
    }
    return { data: htmlMulti };
  };
  cheerioBehavior = makeCheerio;
  let info = await getTunerInfo('http://example.com/');
  assert.deepStrictEqual(info.antNames, ['VER', 'HOR']);
  assert.strictEqual(info.activeAnt, 2);

  // Scenario 2: HTML with two antennas only
  axiosBehavior = (url) => {
    if (url.endsWith('/static_data')) return { data: {} };
    return { data: htmlMulti };
  };
  cheerioBehavior = makeCheerio;
  info = await getTunerInfo('http://example.com/');
  assert.deepStrictEqual(info.antNames, ['VER', 'HOR']);
  assert.strictEqual(info.activeAnt, 1);

  // Scenario 3: HTML single antenna container
  const htmlSingle = '<div id="data-ant-container"></div>';
  axiosBehavior = (url) => {
    if (url.endsWith('/static_data')) return { data: {} };
    return { data: htmlSingle };
  };
  cheerioBehavior = makeCheerio;
  info = await getTunerInfo('http://example.com/');
  assert.deepStrictEqual(info.antNames, ['Default']);
  assert.strictEqual(info.activeAnt, 0);

  console.log('All tests passed');
})()
  .catch(err => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => {
    Module._load = originalLoad;
  });
