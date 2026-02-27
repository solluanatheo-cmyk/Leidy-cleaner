import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

export default async () => {
  const currentDir = path.dirname(new URL(import.meta.url).pathname);
  const pidFile = path.resolve(currentDir, '.backend-pid');
  if (fs.existsSync(pidFile)) {
    const pid = parseInt(fs.readFileSync(pidFile, 'utf8'));
    try {
      process.kill(pid);
    } catch {
      // ignore if already gone
    }
    fs.unlinkSync(pidFile);
  }
  // tear down test containers using docker-compose (includes redis)
  const repoRoot = path.resolve(currentDir, '../..');
  try {
    execSync(`docker-compose -f ${repoRoot}/docker-compose.test.yml down -v`, { stdio: 'inherit' });
  } catch (_e) {
    // ignore
  }};
