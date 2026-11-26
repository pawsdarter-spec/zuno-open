// Performance regression checks for expensive client-side work.
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'zuno43.js'), 'utf8');
const scanner = source.slice(source.indexOf('function markScams43()'), source.indexOf('// ======================= 0.43.1: old replies'));
assert.ok(scanner.includes('new Map(messages.map('), 'scam scanning should build a single message lookup');
assert.ok(!scanner.includes('.messages.find('), 'scam scanning must not linearly search messages once per row');
assert.ok(!/setInterval\s*\(\s*\(\)\s*=>\s*\{\s*try\s*\{\s*markScams43/.test(scanner), 'scam scanning must not poll while the chat is idle');
console.log('Performance regression checks passed.');
