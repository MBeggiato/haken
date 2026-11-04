import { lstatSync } from 'node:fs';
import { lock } from 'proper-lockfile';

export async function acquireLock(todo: string) {
  const path = todo + '.web.lock';
  try {
    if (!lstatSync(path).isDirectory()) {
      throw new Error(`Legacy lock at ${path}. Stop any server using this file, remove the old lock file, then restart.`);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  try {
    return await lock(todo, {
      realpath: false,
      lockfilePath: path,
      stale: 10000,
      update: 2000
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ELOCKED') {
      throw new Error(`Another server is running or stopped recently (${path}). If it crashed, wait 10 seconds and retry.`, { cause: error });
    }
    throw error;
  }
}
