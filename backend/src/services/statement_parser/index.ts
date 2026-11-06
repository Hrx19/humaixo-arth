import { CSVParser } from './csv-parser';
import { PDFParser, XLSXParser } from './unsupported-parsers';
import type { IParser, StatementFormat } from './types';

export { CSVParser } from './csv-parser';
export { PDFParser, XLSXParser } from './unsupported-parsers';
export { normalizeStatementAmount, normalizeStatementDate } from './normalizer';
export type {
  FieldProvenance,
  IParser,
  NormalizedStatementRow,
  ParsedStatementRow,
  RawStatementRow,
  StatementDirection,
  StatementFormat,
  StatementRowIssue,
} from './types';

const parserStrategies: Record<StatementFormat, IParser> = {
  csv: new CSVParser(),
  pdf: new PDFParser(),
  xlsx: new XLSXParser(),
};

export function getStatementParser(format: StatementFormat): IParser {
  return parserStrategies[format];
}
