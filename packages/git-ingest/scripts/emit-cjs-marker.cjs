// Emits dist-cjs/package.json so Node loads the dual CJS build as CommonJS
// (the package root sets "type": "module" for the ESM dist/ build).
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'dist-cjs');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(
  path.join(dir, 'package.json'),
  `${JSON.stringify({ type: 'commonjs' }, null, 2)}\n`,
);
