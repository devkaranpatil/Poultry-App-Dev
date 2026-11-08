#!/usr/bin/env node
/**
 * One command to install and run Kukkut on this machine:
 *
 *   npm start              install what is missing, then run the API (port 5000) and the website (port 8080)
 *   npm start -- --with-ai also download the AI models first (about 3 GB, once)
 *
 * It installs the frontend and backend packages when they are missing or older than their lockfile, creates
 * .env and backend/.env from their examples, checks the two ports are free, then runs both servers with their
 * output side by side. Ctrl+C stops both. Uses only Node's own modules, so it works before anything is installed.
 */
import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, readdirSync, readFileSync, statSync, utimesSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const backend = path.join(root, 'backend');
const isWindows = process.platform === 'win32';
const withAi = process.argv.includes('--with-ai');
const WEB_PORT = 8080;
const API_PORT = 5000;

const colour = (code) => (text) => (process.stdout.isTTY ? `\x1b[${code}m${text}\x1b[0m` : text);
const green = colour('32');
const yellow = colour('33');
const cyan = colour('36');
const magenta = colour('35');
const bold = colour('1');

const step = (text) => console.log(`\n${bold('==')} ${text}`);
const note = (text) => console.log(`   ${yellow('!')} ${text}`);
const fail = (text) => {
  console.error(`\n${colour('31')('x')} ${text}`);
  process.exit(1);
};

/**
 * The npm command line for spawn. npm is a .cmd file on Windows, which needs a shell, and Node wants a shell
 * command as one string; every argument here is a fixed word, so joining them is safe.
 */
const npmCommand = (args) => (isWindows ? ['npm ' + args.join(' '), []] : ['npm', args]);

/** Runs npm in a folder and waits. */
function npm(args, cwd) {
  const [command, rest] = npmCommand(args);
  const result = spawnSync(command, rest, { cwd, stdio: 'inherit', shell: isWindows });
  if (result.status !== 0) fail(`"npm ${args.join(' ')}" failed in ${path.relative(root, cwd) || '.'}`);
}

/** Packages need installing when node_modules is missing or the lockfile changed since the last install. */
function needsInstall(dir) {
  const installed = path.join(dir, 'node_modules', '.package-lock.json');
  const lock = path.join(dir, 'package-lock.json');
  if (!existsSync(installed)) return true;
  return existsSync(lock) && statSync(lock).mtimeMs > statSync(installed).mtimeMs;
}

function portFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => server.close(() => resolve(true)));
    server.listen(port);
  });
}

// 1. Node.js
const [major, minor] = process.versions.node.split('.').map(Number);
// What Vite 8 supports: 20.19+, 22.12+ or 23 and later.
const supported = (major === 20 && minor >= 19) || (major === 22 && minor >= 12) || major >= 23;
if (!supported) {
  fail(`Kukkut needs Node.js 20.19+ or 22.12+; this is ${process.versions.node}. Get the LTS from https://nodejs.org`);
}

// 2. Packages
step('Packages');
for (const [label, dir] of [
  ['website', root],
  ['API', backend],
]) {
  if (needsInstall(dir)) {
    console.log(`   installing the ${label} packages (first run takes a few minutes)`);
    npm(['install', '--no-audit', '--no-fund'], dir);
    // npm leaves its record untouched when nothing changed; mark this install as newer than the lockfile.
    const record = path.join(dir, 'node_modules', '.package-lock.json');
    if (existsSync(record)) utimesSync(record, new Date(), new Date());
  } else {
    console.log(`   ${label} packages ${green('up to date')}`);
  }
}

// 3. Settings
step('Settings');
for (const [file, example] of [
  [path.join(root, '.env'), path.join(root, '.env.example')],
  [path.join(backend, '.env'), path.join(backend, '.env.example')],
]) {
  const name = path.relative(root, file);
  if (existsSync(file)) {
    console.log(`   ${name} ${green('found')}`);
  } else {
    copyFileSync(example, file);
    console.log(`   ${name} ${green('created')} from ${path.basename(example)}`);
  }
}
const backendEnv = readFileSync(path.join(backend, '.env'), 'utf8');
const frontendEnv = readFileSync(path.join(root, '.env'), 'utf8');
const setting = (text, key) => (text.match(new RegExp(`^${key}=(.*)$`, 'm'))?.[1] ?? '').trim();
if (!setting(frontendEnv, 'VITE_SUPABASE_PUBLISHABLE_KEY') || /your-project-ref/.test(setting(backendEnv, 'SUPABASE_URL'))) {
  note('Sign-in is off until the Supabase project is set in .env and backend/.env (see README, "Sign-in").');
  note('The landing page and the free estimate work without it.');
}

// 4. AI models
const modelsDir = path.join(backend, '.models');
const hasModels = existsSync(modelsDir) && readdirSync(modelsDir).some((file) => file.endsWith('.gguf'));
if (withAi && !hasModels) {
  step('AI models (about 3 GB, once)');
  npm(['run', 'models:download'], backend);
} else if (!hasModels) {
  note('The AI advisor is off until its models are downloaded: npm start -- --with-ai');
}

// 5. Ports
step('Ports');
for (const [port, what] of [
  [API_PORT, 'API'],
  [WEB_PORT, 'website'],
]) {
  if (!(await portFree(port))) fail(`Port ${port} (${what}) is already in use. Is Kukkut already running? Stop it and try again.`);
}
console.log(`   ${API_PORT} and ${WEB_PORT} ${green('free')}`);

// 6. Run both
step('Running');
console.log(`   website ${bold(cyan(`http://localhost:${WEB_PORT}`))}   API ${bold(magenta(`http://localhost:${API_PORT}`))}   Ctrl+C stops both\n`);

const children = [];
let stopping = false;

function stopAll(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (child.exitCode !== null) continue;
    // On Windows the shell's children outlive a plain kill; end the whole tree.
    if (isWindows) spawnSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore' });
    else child.kill('SIGTERM');
  }
  process.exit(code);
}

function run(label, paint, args, cwd) {
  const [command, rest] = npmCommand(args);
  const child = spawn(command, rest, { cwd, shell: isWindows, env: { ...process.env, FORCE_COLOR: '1' } });
  const prefix = paint(`[${label}]`.padEnd(6));
  for (const stream of [child.stdout, child.stderr]) {
    let rest = '';
    stream.on('data', (chunk) => {
      const lines = (rest + chunk.toString()).split(/\r?\n/);
      rest = lines.pop() ?? '';
      for (const line of lines) console.log(`${prefix} ${line}`);
    });
  }
  child.on('exit', (code) => {
    if (stopping) return;
    console.log(`\n${prefix} stopped${code ? ` (exit code ${code})` : ''}; stopping the other one too.`);
    stopAll(code ?? 0);
  });
  children.push(child);
}

process.on('SIGINT', () => stopAll(0));
process.on('SIGTERM', () => stopAll(0));

run('api', magenta, ['run', 'dev'], backend);
run('web', cyan, ['run', 'dev', '--', '--strictPort'], root);
