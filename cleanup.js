const fs = require('fs');
const path = require('path');
const spawnSync = require('child_process').spawnSync;

const logDir = '/tmp/pg-valgrind';

// https://github.com/orgs/community/discussions/26736
function escape(s) {
  return s.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
}

if (!fs.existsSync(logDir)) {
  process.exit();
}

const user = process.env['USER'];
spawnSync('sudo', ['chown', '-R', user, logDir]);
spawnSync('sudo', ['chown', user, '/tmp/postgres.log']);

const files = fs.readdirSync(logDir);
for (const file of files) {
  const contents = fs.readFileSync(path.join(logDir, file), 'utf8');
  if (contents.includes('Memcheck') || file.includes('ubsan.')) {
    console.log(`::error::${escape(contents)}`);
  }
}

const contents = fs.readFileSync('/tmp/postgres.log', 'utf8');
if (contents.includes('TRAP:')) {
  console.log(`::error::${escape(contents)}`);
}
