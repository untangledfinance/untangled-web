import { Algorithm, decode, sign, verify } from 'jsonwebtoken';

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
   * Signs a payload.
   * @param payload the payload object.
   * @param expiry number of seconds until the generated token expires.
   * @param algorithm the signing algorithm.
   * @param signingKey the signing key (default: the configured private key).
   * @returns a token string for further verification.
   */
  sign(
    payload: any,
    expiry?: number,
    algorithm?: Algorithm,
    signingKey?: string
  ) {
    return sign(payload, signingKey ?? this.privateKey, {
      allowInsecureKeySizes: true,
      expiresIn: expiry ?? this.expiry,
      algorithm: algorithm ?? this.algorithm,
    });
  }

  /**
   * Verifies a given token.
   * @param token the token string.
   * @param verifyingKey the verifying key (default: the configured private key).
   * @param unsafe to not throwing error when verification fails.
   * @throws an error if failed.
   */
  verify<T>(
    token: string,
    verifyingKey?: string,
    unsafe = false
  ): T | undefined {
    try {
      return verify(token, verifyingKey ?? this.privateKey) as T;
    } catch (err) {
      if (!unsafe) throw err;
    }
  }

  /**
   * Extracts a token's payload.
   * @param token the token string.
   */
  decode<T>(token: string): T | undefined {
    const payload = decode(token);
    return payload !== null ? (payload as T) : undefined;
  }
}
