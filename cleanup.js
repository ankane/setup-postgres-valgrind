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

spawnSync('sudo', ['chown', '-R', process.env['USER'], logDir]);

const files = fs.readdirSync(logDir);
for (const file of files) {
  const contents = fs.readFileSync(path.join(logDir, file), 'utf8');
  console.log(file);
  console.log(contents);
}
