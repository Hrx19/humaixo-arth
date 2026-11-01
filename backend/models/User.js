const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const PASSWORD_SALT_ROUNDS = 10;

const userSchema = new mongoose.Schema(
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
      minlength: 6,
      maxlength: 128,
      select: false,
    },
  },
  { timestamps: true },
);

userSchema.pre('save', async function hashPasswordBeforeSave() {
  if (!this.isModified('password')) return;

  this.password = await bcrypt.hash(this.password, PASSWORD_SALT_ROUNDS);
});

userSchema.methods.comparePassword = async function comparePassword(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
