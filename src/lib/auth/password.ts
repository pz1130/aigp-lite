import argon2 from "argon2";

export async function hashPassword(plain: string): Promise<string> {
  if (!plain) throw new Error("password must not be empty");
  return argon2.hash(plain, { type: argon2.argon2id });
}

export async function verifyPassword(
  hash: string,
  plain: string,
): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}
