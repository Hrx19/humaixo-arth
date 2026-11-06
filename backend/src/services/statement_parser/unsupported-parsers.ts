import type { IParser, ParsedStatementRow, StatementFormat } from './types';

abstract class UnsupportedParser implements IParser {
  abstract readonly format: StatementFormat;
  readonly version = 'stub-v1';

  parse(_input: Buffer | string): ParsedStatementRow[] {
    throw new Error(`${this.format.toUpperCase()} statement parsing is not available yet. Upload a CSV file.`);
  }
}

export class PDFParser extends UnsupportedParser {
  readonly format = 'pdf' as const;
}

export class XLSXParser extends UnsupportedParser {
  readonly format = 'xlsx' as const;
}
