import { startServer } from './src/server';

if (require.main === module) {
  void startServer().catch(() => {
    process.exitCode = 1;
  });
}

