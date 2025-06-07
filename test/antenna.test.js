const assert = require('assert');
const antenna = require('../antenna');

antenna.setAntNames(['V', 'H']);
assert.strictEqual(antenna.getAntLabel(0), 'V');
assert.strictEqual(antenna.getAntLabel(1), 'H');
assert.strictEqual(antenna.cycleAntenna(0), 1);
assert.strictEqual(antenna.cycleAntenna(1), 0);

// Override count parameter
assert.strictEqual(antenna.cycleAntenna(1, 3), 2);
assert.strictEqual(antenna.cycleAntenna(2, 3), 0);

antenna.setAntNames([]);
assert.strictEqual(antenna.cycleAntenna(0), 1);
assert.strictEqual(antenna.getAntLabel(0), '0');
console.log('All tests passed');

