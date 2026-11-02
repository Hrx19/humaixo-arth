import bcrypt from 'bcryptjs';
import {
  model,
  models,
  Schema,
  type HydratedDocument,
  type Model,
} from 'mongoose';

const PASSWORD_SALT_ROUNDS = 12;

export type AuthProvider = 'email' | 'google' | 'github';

export interface UserRecord {
  name: string;
  email: string;
  password?: string;
  googleSubject?: string;
  githubUserId?: string;
  authProviders?: AuthProvider[];
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
      minlength: 8,
      maxlength: 128,
      select: false,
    },
    googleSubject: {
      type: String,
      unique: true,
      sparse: true,
      select: false,
    },
    githubUserId: {
      type: String,
      unique: true,
      sparse: true,
      select: false,
    },
    authProviders: {
      type: [String],
      enum: ['email', 'google', 'github'],
      default: [],
    },
  },
  { timestamps: true },
);

userSchema.pre('validate', function requireAuthenticationMethod() {
  if (!this.password && !this.googleSubject && !this.githubUserId) {
    this.invalidate(
      'password',
      'An email password or verified OAuth identity is required.',
    );
  }
});

// Mongoose 9 awaits this promise; callback-style `next` is not supported here.
userSchema.pre('save', async function hashPasswordBeforeSave() {
  if (!this.password || !this.isModified('password')) return;

  this.password = await bcrypt.hash(this.password, PASSWORD_SALT_ROUNDS);
});

userSchema.methods.comparePassword = async function comparePassword(
  candidatePassword: string,
): Promise<boolean> {
  if (!this.password) return false;
  return bcrypt.compare(candidatePassword, this.password);
};

export const UserModel =
  (models.User as UserModelType | undefined) ??
  model<UserRecord, UserModelType>('User', userSchema);
