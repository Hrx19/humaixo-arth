import { Types, type ClientSession } from 'mongoose';
import { CategoryModel, type CategoryKind } from '../../models/Category';
import { PersonModel } from '../../models/Person';

export function normalizePersonKey(value: string): string {
  return value
    .normalize('NFKC')
    .trim()
    .toLocaleLowerCase('en-IN')
    .replace(/\s+/g, ' ');
}

export async function findOrCreatePerson(
  userId: Types.ObjectId,
  displayName: string | null | undefined,
  session?: ClientSession,
): Promise<Types.ObjectId | undefined> {
  const name = displayName?.trim().slice(0, 120);
  if (!name) return undefined;
  const key = normalizePersonKey(name);
  if (!key) return undefined;
  const person = await PersonModel.findOneAndUpdate(
    { userId, normalizedKey: key },
    { $setOnInsert: { userId, normalizedKey: key, displayName: name, source: 'statement' } },
    { upsert: true, new: true, setDefaultsOnInsert: true, ...(session ? { session } : {}) },
  );
  return person._id;
}

export async function findOrCreateCategory(
  userId: Types.ObjectId,
  name: string,
  kind: CategoryKind,
  session?: ClientSession,
): Promise<Types.ObjectId> {
  const category = await CategoryModel.findOneAndUpdate(
    { userId, name },
    { $setOnInsert: { userId, name, kind, isDefault: false } },
    { upsert: true, new: true, setDefaultsOnInsert: true, ...(session ? { session } : {}) },
  );
  return category._id;
}
