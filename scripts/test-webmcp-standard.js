#!/usr/bin/env node
'use strict';

const assert = require('assert');
const { parseImplementationStatus } = require('../services/webmcp/standardTracker');

const sample = `# Implementation Status

# Chrome

An [Origin Trial](https://developer.chrome.com/blog/ai-webmcp-origin-trial) is live in Chrome 149.

# Edge

An [Origin Trial](https://example.com) is live in Edge 150.

# Firefox

* [Mozilla standards-positions](https://github.com/mozilla/standards-positions/issues/1412)
`;

const browsers = parseImplementationStatus(sample);
assert.strictEqual(browsers.length, 3);
assert.strictEqual(browsers.find((b) => b.name === 'Chrome').support_status, 'origin_trial');
assert.strictEqual(browsers.find((b) => b.name === 'Edge').support_status, 'origin_trial');
assert.strictEqual(browsers.find((b) => b.name === 'Firefox').support_status, 'planned');
console.log('webmcp standard tracker tests OK');
