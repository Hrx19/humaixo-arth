import bcrypt from 'bcryptjs';
import {
  model,
  models,
  Schema,
  type HydratedDocument,
  type Model,
} from 'mongoose';

const PASSWORD_SALT_ROUNDS = 10;

export interface UserRecord {
  name: string;
  email: string;
  password: string;
}

export interface UserMethods {
  comparePassword(candidatePassword: string): Promise<boolean>;
}

export type UserDocument = HydratedDocument<UserRecord, UserMethods>;
type UserModelType = Model<UserRecord, object, UserMethods>;

const userSchema = new Schema<UserRecord, UserModelType, UserMethods>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 254,
    },
    password: {
      type: String,
      required: true,
      minlength: 8,
      maxlength: 128,
      select: false,
    },
  },
  { timestamps: true },
);

// Mongoose 9 awaits this promise; callback-style `next` is not supported here.
userSchema.pre('save', async function hashPasswordBeforeSave() {
  if (!this.isModified('password')) return;

  this.password = await bcrypt.hash(this.password, PASSWORD_SALT_ROUNDS);
});

userSchema.methods.comparePassword = async function comparePassword(
  candidatePassword: string,
): Promise<boolean> {
  return bcrypt.compare(candidatePassword, this.password);
};

export const UserModel =
  (models.User as UserModelType | undefined) ??
  model<UserRecord, UserModelType>('User', userSchema);
