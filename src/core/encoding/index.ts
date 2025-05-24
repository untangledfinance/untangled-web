import bcrypt from 'bcryptjs';

const PASSWORD_HASHING_SALT = 10;

export function hashPassword(rawPassword: string) {
  const hashedPassword = bcrypt.hashSync(rawPassword, PASSWORD_HASHING_SALT);
  return hashedPassword;
}

export function isSamePassword(rawPassword: string, hashedPassword: string) {
  return bcrypt.compareSync(rawPassword, hashedPassword);
}
