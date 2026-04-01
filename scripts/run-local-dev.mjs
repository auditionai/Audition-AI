import process from 'node:process';
import { spawn } from 'node:child_process';

const isWindows = process.platform === 'win32';
const command = isWindows ? 'cmd.exe' : 'npm';

const spawnNpm = (scriptName) => {
  const args = isWindows ? ['/c', 'npm.cmd', 'run', scriptName] : ['run', scriptName];
  const child = spawn(command, args, {
    stdio: 'inherit',
    shell: false,
    env: process.env,
  });
  return child;
};

const children = [
  spawnNpm('dev:functions'),
  spawnNpm('dev:vite'),
];

const shutdown = (signal = 'SIGTERM') => {
  for (const child of children) {
    if (!child.killed) {
      child.kill(signal);
    }
  }
};

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    shutdown(signal);
    process.exit(0);
  });
}

children.forEach((child) => {
  child.on('exit', (code) => {
    if (typeof code === 'number' && code !== 0) {
      shutdown();
      process.exit(code);
    }
  });
});
