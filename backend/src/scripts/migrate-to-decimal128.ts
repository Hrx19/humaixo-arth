import mongoose from 'mongoose';
import { connectToDatabase, disconnectFromDatabase } from '../config/database';

type MigrationTarget = { collection: string; fields: string[] };

const numericTypes = ['double', 'int', 'long'];
const targets: MigrationTarget[] = [
  { collection: 'accounts', fields: ['openingBalance', 'currentBalance'] },
  { collection: 'transactions', fields: ['amount', 'balanceBefore', 'balanceAfter'] },
  { collection: 'budgets', fields: ['amount'] },
  { collection: 'financial_accounts', fields: ['openingBalance', 'currentBalance'] },
  { collection: 'financial_transactions', fields: ['amount'] },
];

function isLegacyNumeric(fieldPath: string) {
  return { $in: [{ $type: fieldPath }, numericTypes] };
}

async function migrate(): Promise<void> {
  const apply = process.argv.includes('--apply');
  await connectToDatabase();
  try {
    const database = mongoose.connection.db!;
    const existing = new Set(
      (await database.listCollections({}, { nameOnly: true }).toArray()).map(({ name }) => name),
    );
    let totalCandidates = 0;
    let totalModified = 0;

    for (const target of targets) {
      if (!existing.has(target.collection)) continue;
      const collection = database.collection(target.collection);
      for (const field of target.fields) {
        const filter = { $expr: isLegacyNumeric(`$${field}`) };
        const candidates = await collection.countDocuments(filter);
        const alreadyDecimal = await collection.countDocuments({
          $expr: { $eq: [{ $type: `$${field}` }, 'decimal'] },
        });
        totalCandidates += candidates;
        if (!apply || candidates === 0) {
          console.info(
            `${apply ? 'Legacy numeric values' : 'Would convert'} ${target.collection}.${field}: ${candidates}; already Decimal128: ${alreadyDecimal}`,
          );
          continue;
        }

        const result = await collection.updateMany(
          filter,
          [{ $set: { [field]: { $convert: { input: `$${field}`, to: 'decimal' } } } }],
        );
        totalModified += result.modifiedCount;
        console.info(`Converted ${target.collection}.${field}: ${result.modifiedCount}`);
      }
    }

    const statementCollectionName = 'statementimports';
    if (existing.has(statementCollectionName)) {
      const collection = database.collection(statementCollectionName);
      const rowHasLegacyMoney = {
        $anyElementTrue: {
          $map: {
            input: { $ifNull: ['$normalizedRows', []] },
            as: 'row',
            in: {
              $or: ['amount', 'balanceBefore', 'balanceAfter'].map((field) =>
                isLegacyNumeric(`$$row.${field}`),
              ),
            },
          },
        },
      };
      const resultHasLegacyBalance = {
        $and: [
          { $eq: [{ $type: '$result' }, 'object'] },
          isLegacyNumeric('$result.currentBalance'),
        ],
      };
      const filter = { $expr: { $or: [rowHasLegacyMoney, resultHasLegacyBalance] } };
      const candidates = await collection.countDocuments(filter);
      totalCandidates += candidates;

      if (!apply || candidates === 0) {
        const alreadyDecimal = await collection.countDocuments({
          $expr: {
            $or: [
              {
                $anyElementTrue: {
                  $map: {
                    input: { $ifNull: ['$normalizedRows', []] },
                    as: 'row',
                    in: {
                      $or: ['amount', 'balanceBefore', 'balanceAfter'].map((field) => ({
                        $eq: [{ $type: `$$row.${field}` }, 'decimal'],
                      })),
                    },
                  },
                },
              },
              { $eq: [{ $type: '$result.currentBalance' }, 'decimal'] },
            ],
          },
        });
        console.info(
          `${apply ? 'Legacy numeric values' : 'Would convert'} ${statementCollectionName} embedded money: ${candidates}; already Decimal128: ${alreadyDecimal}`,
        );
      } else {
        const convertIfNumeric = (value: string) => ({
          $cond: [
            isLegacyNumeric(value),
            { $convert: { input: value, to: 'decimal' } },
            value,
          ],
        });
        const result = await collection.updateMany(filter, [{
          $set: {
            normalizedRows: {
              $map: {
                input: { $ifNull: ['$normalizedRows', []] },
                as: 'row',
                in: {
                  $mergeObjects: [
                    '$$row',
                    {
                      amount: convertIfNumeric('$$row.amount'),
                      balanceBefore: convertIfNumeric('$$row.balanceBefore'),
                      balanceAfter: convertIfNumeric('$$row.balanceAfter'),
                    },
                  ],
                },
              },
            },
            result: {
              $cond: [
                { $eq: [{ $type: '$result' }, 'object'] },
                {
                  $mergeObjects: [
                    '$result',
                    { currentBalance: convertIfNumeric('$result.currentBalance') },
                  ],
                },
                '$result',
              ],
            },
          },
        }]);
        totalModified += result.modifiedCount;
        console.info(`Converted ${statementCollectionName} embedded money: ${result.modifiedCount}`);
      }
    }

    console.info(JSON.stringify({
      mode: apply ? 'apply' : 'dry-run',
      legacyNumericValuesFound: totalCandidates,
      documentsModified: totalModified,
    }));
    if (!apply) console.info('Re-run with --apply to write the conversions.');
  } finally {
    await disconnectFromDatabase();
  }
}

void migrate().catch((error: unknown) => {
  console.error('Decimal128 migration failed.', error);
  process.exitCode = 1;
});
