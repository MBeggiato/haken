import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, existsSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { acquireLock } from '../server/lock.ts';

mkdirSync('.test-data', { recursive: true });

test('locks reject active owners, release cleanly and recover expired markers', async () => {
  const dir = mkdtempSync(resolve('.test-data', 'lock-'));
  const todo = resolve(dir, 'todo.txt');
  const marker = todo + '.web.lock';
  let release: (() => Promise<void>) | undefined;
  try {
    release = await acquireLock(todo);
    assert.ok(existsSync(marker));
    await assert.rejects(acquireLock(todo), /Another server is running/);
    assert.ok(existsSync(marker), 'Failed acquisition must not remove the owner lock');
    await release(); release = undefined;
    assert.ok(!existsSync(marker));
    mkdirSync(marker);
    const expired = new Date(Date.now() - 20000);
    utimesSync(marker, expired, expired);
    release = await acquireLock(todo);
    assert.ok(existsSync(marker));
  } finally {
    await release?.();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('legacy markers and filesystem errors are not misreported as active servers', async () => {
  const dir = mkdtempSync(resolve('.test-data', 'lock-'));
  const todo = resolve(dir, 'todo.txt');
  try {
    writeFileSync(todo + '.web.lock', '');
    await assert.rejects(acquireLock(todo), /Legacy lock/);
    assert.ok(existsSync(todo + '.web.lock'));
    await assert.rejects(acquireLock(resolve(dir, 'missing', 'todo.txt')), { code: 'ENOENT' });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('process death leaves a recoverable lock and a normal exit releases it', async () => {
  const dir = mkdtempSync(resolve('.test-data', 'lock-'));
  const todo = resolve(dir, 'todo.txt');
  const marker = todo + '.web.lock';
  const start = () => spawn(process.execPath, ['--import', 'tsx', '--input-type=module', '-e',
    "import {acquireLock} from './server/lock.ts'; await acquireLock(process.env.TEST_LOCK_FILE); console.log('ready'); setInterval(()=>{},1000);"
  ], { env: { ...process.env, TEST_LOCK_FILE: todo }, stdio: ['ignore', 'pipe', 'pipe'] });
  let child = start();
  try {
    await once(child.stdout, 'data');
    const killed = once(child, 'exit'); child.kill('SIGKILL'); await killed;
    assert.ok(existsSync(marker));
    // Simulate the expiration interval without slowing down the suite.
    const expired = new Date(Date.now() - 20000);
    utimesSync(marker, expired, expired);
    child = start();
    await once(child.stdout, 'data');
    const stopped = once(child, 'exit'); child.kill('SIGTERM'); await stopped;
    assert.ok(!existsSync(marker));
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit'); child.kill('SIGKILL'); await exited;
    }
    rmSync(dir, { recursive: true, force: true });
  }
});
