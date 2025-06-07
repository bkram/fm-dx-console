const assert = require('assert');
const Module = require('module');

let calledUrl;
const axiosStub = {
  get: async (url) => {
    calledUrl = url;
    return { status: 200 };
  }
};

const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === 'axios') return axiosStub;
  if (request === 'cheerio') return { load: () => ({}) };
  return originalLoad(request, parent, isMain);
};

const { getPingTime } = require('../tunerinfo');

(async () => {
  await getPingTime('http://example.com/');
  assert.strictEqual(calledUrl, 'http://example.com/ping');

  await getPingTime('http://example.com/dir');
  assert.strictEqual(calledUrl, 'http://example.com/dir/ping');

  console.log('All tests passed');
})()
  .catch(err => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => {
    Module._load = originalLoad;
  });
