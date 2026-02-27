import { spawn, execSync } from 'child_process';
import path from 'path';
import fs from 'fs';

// calculate __dirname equivalent in ESM
const currentDir = path.dirname(new URL(import.meta.url).pathname);

// start test infrastructure (postgres + redis) via docker-compose so
// both services share a network and restart policy.  using compose also
// makes teardown simpler.
const repoRoot = path.resolve(currentDir, '../..');
try {
  execSync(`docker-compose -f ${repoRoot}/docker-compose.test.yml up -d`, { stdio: 'inherit' });
} catch (e) {
  console.warn('could not start test containers', e.message || e);
}

// wait for postgres readiness
for (let i = 0; i < 20; i++) {
  try {
    execSync('docker exec leidycleaner-postgres-test pg_isready -U postgres', { stdio: 'ignore' });
    break;
  } catch {
    await new Promise((r) => setTimeout(r, 500));
  }
}

// ensure the expected test database exists (volume may already have been
// initialized in a previous run)
try {
  execSync(`docker exec leidycleaner-postgres-test createdb -U postgres leidycleaner_test 2>/dev/null || true`, { stdio: 'inherit' });
} catch (e) {
  console.warn('could not ensure test database exists', e.message || e);
}

// wait for redis readiness by pinging the container
for (let i = 0; i < 20; i++) {
  try {
    execSync('docker exec leidycleaner-redis-test redis-cli ping', { stdio: 'ignore' });
    break;
  } catch {
    await new Promise((r) => setTimeout(r, 500));
  }
}


// Spawn the backend in test mode so that Playwright has a fresh server
// with migrations/seeds already applied.  The PID is written to a temporary
// file so that globalTeardown can kill it later.
// backend is two levels up from tests folder
const backendDir = path.resolve(currentDir, '../..', 'backend');
const pidFile = path.resolve(currentDir, '.backend-pid');

// kill any stray process listening on 3001 (often left from previous runs)
try {
  execSync('lsof -ti :3001 | xargs -r kill -9 || true');
} catch {
  /* ignore */
}
// also try removing stale pid file
if (fs.existsSync(pidFile)) {
  try {
    const old = parseInt(fs.readFileSync(pidFile, 'utf-8'), 10);
    process.kill(old, 'SIGTERM');
  } catch {
    // ignore
  }
  fs.unlinkSync(pidFile);
}

// start without the "watch" flag so the process doesn't restart when
// we edit code during development; a single-shot server is easier to manage
const backendProc = spawn('npm', ['run', 'start:test-server'], {
  cwd: backendDir,
  env: { ...process.env, NODE_ENV: 'test' },
  stdio: ['ignore', 'inherit', 'inherit'],
});

// record pid for teardown
fs.writeFileSync(pidFile, String(backendProc.pid));

// helper to wait for backend and frontend startup
async function waitForReady() {
  // wait for backend to be ready (migrations can be slow)
  console.log('⏳ Waiting for backend to start...');
  for (let i = 0; i < 60; i++) {
    try {
      const response = await fetch('http://localhost:3001/health');
      if (response.ok) {
        console.log('✅ Backend is ready');
        break;
      }
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  // wait for frontend dev server to be ready (Playwright's webServer will start it)
  console.log('⏳ Waiting for frontend dev server to start...');
  for (let i = 0; i < 60; i++) {
    try {
      const response = await fetch('http://localhost:3000');
      if (response.ok) {
        console.log('✅ Frontend dev server is ready');
        break;
      }
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  // ensure redis container accepts connections
  console.log('⏳ Waiting for Redis to accept PING...');
  for (let i = 0; i < 20; i++) {
    try {
      execSync('docker exec leidycleaner-redis-test redis-cli ping', { stdio: 'inherit' });
      console.log('✅ Redis responded to PING');
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
}

export default async () => {
  await waitForReady();
};
