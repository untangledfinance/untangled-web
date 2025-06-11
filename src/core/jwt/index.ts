import { sign, Algorithm, verify } from 'jsonwebtoken';

/**
 * JSON Web Token utilities.
 */
export class Jwt {
  private readonly privateKey: string;
  private readonly expiry: number;
  private readonly algorithm: Algorithm;

  constructor(
    privateKey: string,
    expiry: number = 300,
    algorithm: Algorithm = 'HS256'
  ) {
    this.privateKey = privateKey;
    this.expiry = expiry;
    this.algorithm = algorithm;
  }

  /**
   * Signs a payload with pre-configured private key.
   * @param payload the payload object.
   * @param expiry number of seconds until the generated token expires.
   * @param algorithm the signing algorithm.
   * @returns a token string for further verification.
   */
  sign(payload: any, expiry?: number, algorithm?: Algorithm) {
    return sign(payload, this.privateKey, {
      expiresIn: expiry ?? this.expiry,
      algorithm: algorithm ?? this.algorithm,
    });
  }

  /**
   * Verifies a given token.
   * @param token the token string.
   * @param unsafe to not throwing error when verification fails.
   * @throws an error if failed.
   */
  verify<T>(token: string, unsafe = false) {
    try {
      return verify(token, this.privateKey) as T;
    } catch (err) {
      if (!unsafe) throw err;
    }
  }
}
