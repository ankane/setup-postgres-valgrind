const fs = require('fs');
const os = require('os');
const spawnSync = require('child_process').spawnSync;

const versionMap = {
  '19': '19.0',
  '18': '18.7',
  '17': '17.12',
  '16': '16.16',
  '15': '15.20',
  '14': '14.25',
  '13': '13.23',
  '12': '12.22'
};

const bin = '/usr/local/pgsql/bin';
const dataDir = '/usr/local/pgsql/data';
const logDir = '/tmp/pg-valgrind';

function runEnv() {
  const args = Array.from(arguments);
  const env = args.shift();
  const command = args.shift();
  const options = {
    encoding: 'utf8',
    env: Object.assign({}, process.env, env),
    maxBuffer: 4 * 1024 * 1024
  };
  // spawn is safer and more lightweight than exec
  const ret = spawnSync(command, args, options);
  if (ret.status !== 0) {
    console.log(command, args.join(' '));
    console.log(ret.stdout);
    console.log(ret.stderr);
    throw ret.error;
  }
}

function run() {
  const args = Array.from(arguments);
  runEnv({}, ...args);
}

function step(message) {
  console.log(message);
}

function addToEnv(value) {
  fs.appendFileSync(process.env.GITHUB_ENV, `${value}\n`);
}

function addToPath(newPath) {
  fs.appendFileSync(process.env.GITHUB_PATH, `${newPath}\n`);
}

if (process.platform != 'linux') {
  throw `Platform not supported: ${process.platform}`;
}

let postgresVersion = process.env['INPUT_POSTGRES-VERSION'];
if (postgresVersion != 'devel') {
  postgresVersion = parseFloat(postgresVersion);
}
if (!['devel', 19, 18, 17, 16, 15, 14, 13, 12].includes(postgresVersion)) {
  throw `Postgres version not supported: ${postgresVersion}`;
}

const trackOrigins = process.env['INPUT_TRACK-ORIGINS'];
if (!['yes', 'no'].includes(trackOrigins)) {
  throw `Invalid value for track-origins: ${trackOrigins}`;
}

const checkUb = process.env['INPUT_CHECK-UB'];
if (!['yes', 'no'].includes(checkUb)) {
  throw `Invalid value for check-ub: ${checkUb}`;
}

const asan = process.env['INPUT_ASAN'];
if (!['yes', 'no'].includes(asan)) {
  throw `Invalid value for asan: ${asan}`;
}

step('Installing packages');
run('sudo', 'apt-get', 'update');
run('sudo', 'apt-get', 'install', 'libipc-run-perl', 'libreadline-dev', ...(asan ? [] : ['valgrind']));

step('Downloading Postgres');
process.chdir('/tmp');
const tag = postgresVersion == 'devel' ? 'master' : `REL_${versionMap[postgresVersion].replace('.', '_').toUpperCase()}`;
const refType = postgresVersion == 'devel' ? 'heads' : 'tags';
run('wget', '-q', `https://github.com/postgres/postgres/archive/refs/${refType}/${tag}.tar.gz`);
run('tar', 'xf', `${tag}.tar.gz`);
run('mv', `postgres-${tag}`, 'postgres');

step('Compiling Postgres (this can take a few minutes)');
process.chdir('postgres');
const sanitize = [];
if (asan) {
  sanitize.push('address', 'pointer-compare', 'pointer-subtract');
}
if (checkUb) {
  sanitize.push('undefined');
}
const sanitizeFlags = sanitize.length == 0 ? '' : sanitize.join(',');

runEnv({'CFLAGS': asan ? sanitizeFlags : `-DUSE_VALGRIND ${sanitizeFlags}`, 'LDFLAGS': sanitizeFlags}, './configure', '--enable-cassert', '--enable-debug', '--enable-tap-tests');
run('sudo', 'make', `-j${os.availableParallelism()}`);

step('Installing Postgres');
run('sudo', 'make', 'install');
if (process.arch == 'arm64') {
  run('sudo', 'adduser', 'postgres');
}
run('sudo', 'mkdir', '-p', dataDir);
run('sudo', 'chown', 'postgres', dataDir);
run('sudo', '-u', 'postgres', ...(asan ? ['ASAN_OPTIONS=detect_leaks=0'] : []), `${bin}/initdb`, '-D', dataDir);

let script = `#!/bin/sh\n

export UBSAN_OPTIONS=log_path=${logDir}/ubsan

exec valgrind \\
    --quiet \\
    --leak-check=no \\
    --track-origins=${trackOrigins} \\
    --error-exitcode=128 \\
    --gen-suppressions=all \\
    --suppressions=/tmp/postgres/src/tools/valgrind.supp \\
    --log-file=${logDir}/%p-%n.log \\
    --trace-children=yes \\
    ${bin}/postgres.orig "$@"
`;
if (asan) {
  script = `#!/bin/sh\n

export ASAN_OPTIONS=log_path=${logDir}/asan:detect_invalid_pointer_pairs=2:detect_leaks=0
export UBSAN_OPTIONS=log_path=${logDir}/ubsan

exec ${bin}/postgres.orig "$@"
`;
  addToEnv(`ASAN_OPTIONS=log_path=${logDir}/asan:detect_invalid_pointer_pairs=2:detect_leaks=0`);
}
fs.writeFileSync('/tmp/script', script, {mode: 0o755});
run('sudo', 'mv', `${bin}/postgres`, `${bin}/postgres.orig`);
run('sudo', 'mv', '/tmp/script', `${bin}/postgres`);

run('sudo', '-u', 'postgres', 'mkdir', logDir);
run('sudo', 'chmod', 'a+w', logDir);

step('Starting Postgres');
run('sudo', '-u', 'postgres', `${bin}/pg_ctl`, 'start', '-D', dataDir, '-l', '/tmp/postgres.log');
run('sudo', '-u', 'postgres', `${bin}/createuser`, '-s', process.env['USER']);

addToEnv(`PG_CONFIG=${bin}/pg_config`);
addToPath(bin);
