const fs = require('fs');
const spawnSync = require('child_process').spawnSync;

const versionMap = {
  '16': '16.1',
  '15': '15.5',
  '14': '14.10',
  '13': '13.13',
  '12': '12.17'
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
    env: Object.assign({}, process.env, env)
  };
  // spawn is safer and more lightweight than exec
  const ret = spawnSync(command, args, options);
  if (ret.status !== 0) {
    console.log(command, args.join(' '));
    console.log(ret.stdout);
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

const postgresVersion = parseFloat(process.env['INPUT_POSTGRES-VERSION']);
if (![16, 15, 14, 13, 12].includes(postgresVersion)) {
  throw `Postgres version not supported: ${postgresVersion}`;
}

const trackOrigins = process.env['INPUT_TRACK-ORIGINS'];
if (!['yes', 'no'].includes(trackOrigins)) {
  throw `Invalid value for track-origins: ${trackOrigins}`;
}

step('Installing Valgrind');
run('sudo', 'apt-get', 'update');
run('sudo', 'apt-get', 'install', 'libipc-run-perl', 'valgrind');

step('Downloading Postgres');
process.chdir('/tmp');
const tag = `REL_${versionMap[postgresVersion].replace('.', '_')}`;
run('wget', '-q', `https://github.com/postgres/postgres/archive/refs/tags/${tag}.tar.gz`);
run('tar', 'xf', `${tag}.tar.gz`);
run('mv', `postgres-${tag}`, 'postgres')

step('Compiling Postgres (this can take a few minutes)');
process.chdir('postgres');
runEnv({'CFLAGS': '-DUSE_VALGRIND'}, './configure', '--enable-cassert', '--enable-debug', '--enable-tap-tests');
run('sudo', 'make');

step('Installing Postgres');
run('sudo', 'make', 'install');
run('sudo', 'mkdir', '-p', dataDir);
run('sudo', 'chown', 'postgres', dataDir);
run('sudo', '-u', 'postgres', `${bin}/initdb`, '-D', dataDir);

const script = `#!/bin/sh\n

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
