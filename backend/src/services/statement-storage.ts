import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';

export interface StatementStorage {
  store(contents: Buffer): Promise<string>;
  read(key: string): Promise<Buffer>;
  remove(key: string): Promise<void>;
}

export class LocalStatementStorage implements StatementStorage {
  private readonly directory = (() => {
    const workingDirectory = process.cwd();
    const backendDirectory = basename(workingDirectory).toLowerCase() === 'backend'
      ? workingDirectory
      : resolve(workingDirectory, 'backend');
    return resolve(backendDirectory, 'private-storage/statements');
  })();

  async store(contents: Buffer): Promise<string> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const key = `${randomUUID()}.csv`;
    await writeFile(resolve(this.directory, key), contents, { flag: 'wx', mode: 0o600 });
    return key;
  }

  async read(key: string): Promise<Buffer> {
    if (!/^[\da-f-]{36}\.csv$/i.test(key)) throw new Error('Statement storage key is invalid.');
    return readFile(resolve(this.directory, key));
  }

  async remove(key: string): Promise<void> {
    if (!/^[\da-f-]{36}\.csv$/i.test(key)) throw new Error('Statement storage key is invalid.');
    await rm(resolve(this.directory, key), { force: true });
  }
}

export const statementStorage: StatementStorage = new LocalStatementStorage();
