'use strict';

// Keep the historical `node server.js` command safe and compatible while all
// API implementation remains in the maintained TypeScript source tree.
try {
  const { startServer } = require('./dist/server.js');
  void startServer().catch((error) => {
    console.error('Backend startup failed. Run `npm run build` and verify backend/.env.', error);
    process.exitCode = 1;
  });
} catch (error) {
  console.error('The TypeScript backend has not been built. Run `npm run build` first.', error);
  process.exitCode = 1;
}
