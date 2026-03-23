import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';

const timeoutSeconds = Number.parseInt(process.env.NETLIFY_SYNC_FUNCTION_TIMEOUT ?? '300', 10);

if (!Number.isFinite(timeoutSeconds) || timeoutSeconds <= 0) {
  throw new Error(`Invalid NETLIFY_SYNC_FUNCTION_TIMEOUT: ${process.env.NETLIFY_SYNC_FUNCTION_TIMEOUT}`);
}

const devUtilsPath = path.join(process.cwd(), 'node_modules', 'netlify-cli', 'dist', 'utils', 'dev.js');

if (!fs.existsSync(devUtilsPath)) {
  throw new Error(`Could not find Netlify CLI runtime file at ${devUtilsPath}`);
}

let source = fs.readFileSync(devUtilsPath, 'utf8');

const marker = "const BACKGROUND_FUNCTION_TIMEOUT = 900;";
if (!source.includes('const LOCAL_SYNC_FUNCTION_TIMEOUT')) {
  source = source.replace(
    marker,
    `${marker}\nconst LOCAL_SYNC_FUNCTION_TIMEOUT = Number.parseInt(process.env.NETLIFY_SYNC_FUNCTION_TIMEOUT ?? '', 10);`,
  );
}

source = source.replace(
  /syncFunctions:\s*siteInfo\.functions_timeout \?\? siteInfo\.functions_config\?\.timeout \?\? SYNCHRONOUS_FUNCTION_TIMEOUT,/,
  'syncFunctions: Number.isFinite(LOCAL_SYNC_FUNCTION_TIMEOUT) && LOCAL_SYNC_FUNCTION_TIMEOUT > 0 ? LOCAL_SYNC_FUNCTION_TIMEOUT : (siteInfo.functions_timeout ?? siteInfo.functions_config?.timeout ?? SYNCHRONOUS_FUNCTION_TIMEOUT),',
);

source = source.replace(
  /syncFunctions:\s*SYNCHRONOUS_FUNCTION_TIMEOUT,/,
  'syncFunctions: Number.isFinite(LOCAL_SYNC_FUNCTION_TIMEOUT) && LOCAL_SYNC_FUNCTION_TIMEOUT > 0 ? LOCAL_SYNC_FUNCTION_TIMEOUT : SYNCHRONOUS_FUNCTION_TIMEOUT,',
);

fs.writeFileSync(devUtilsPath, source, 'utf8');

console.log(`[local-dev] Netlify sync function timeout forced to ${timeoutSeconds}s`);

const command = process.platform === 'win32' ? 'cmd.exe' : 'npx';
const args =
  process.platform === 'win32'
    ? ['/c', 'npx.cmd', 'netlify', 'functions:serve', '--port', '9999']
    : ['netlify', 'functions:serve', '--port', '9999'];

const child = spawn(command, args, {
  stdio: 'inherit',
  shell: false,
  env: {
    ...process.env,
    NETLIFY_SYNC_FUNCTION_TIMEOUT: String(timeoutSeconds),
  },
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
