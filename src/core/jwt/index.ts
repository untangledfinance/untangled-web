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

  sign(payload: any, expiry?: number, algorithm?: Algorithm) {
    return sign(payload, this.privateKey, {
      expiresIn: expiry ?? this.expiry,
      algorithm: algorithm ?? this.algorithm,
    });
  }

  verify<T>(token: string) {
    return verify(token, this.privateKey) as T;
  }
}
