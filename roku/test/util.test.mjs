// Runs the BrightScript unit tests in the brs-node interpreter.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

test('BrightScript helpers', () => {
  const out = execFileSync('npx', ['brs-cli', '-n', '-c', '0', 'components/lib/util.brs', 'test/util_test.brs'], { cwd: root, encoding: 'utf8' });
  assert.match(out, /ALL TESTS PASSED/, out);
});
