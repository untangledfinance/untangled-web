import { Jwt } from '../../core/jwt';
import {
  Filter,
  Req,
  RequestDecorator,
  Res,
  UnauthorizedError,
} from '../../core/http';
import { RbacValidator } from '../../core/rbac';
import { Role } from '../../core/types';
import { beanOf } from '../../core/ioc';

/**
 * An authorized {@link Req}uest.
 */
export type AuthReq<T = any> = Req<T> & {
  /**
   * Authorization info.
   */
  _auth: {
    id: number;
    email: string;
    roles: Role[];
  };
};

/**
 * Extracts necessary information from an {@link AuthReq}.
 */
export type ReqVerifier<T = any> = (req: AuthReq<T>) =>
  | {
      id: number;
      email: string;
      roles: Role[];
    }
  | undefined;

/**
 * Creates a {@link Filter} with a custom {@link ReqVerifier}.
 */
export function authFilter<T = any>(verifier: ReqVerifier<T>): Filter<T> {
  return async (req: AuthReq<T>, res: Res, ...permissions: string[]) => {
    try {
      const { id, email, roles } = verifier(req) ?? {};
      const validator = beanOf(RbacValidator, true) ?? new RbacValidator();
      let accessible = permissions.length === 0 || !validator.enabled;
      for (const permission of permissions) {
        if (accessible) {
          break;
        }
        for (const role of roles) {
          accessible = validator.check(permission, role);
          if (accessible) {
            break;
          }
        }
      }
      if (id && email && accessible) {
        Object.defineProperty(req, '_auth', {
          value: { id, email, roles },
        });
        return { req, res };
      }
    } catch {}
    throw new UnauthorizedError('Unauthorized');
  };
}

/**
 * A {@link Jwt} {@link Filter}.
 */
export async function jwt<T = any>(
  req: AuthReq<T>,
  res: Res,
  ...permissions: string[]
) {
  return authFilter<T>(({ headers }) => {
    const authorization = headers?.authorization as string;
    const token = authorization?.replace(/^[Bb]earer\s+/g, '')?.trim();
    return beanOf(Jwt).verify(token);
  })(req, res, ...permissions);
}

/**
 * Indicates a method as authorization-required.
 * It uses {@link Jwt} verification internally.
 *
 * It must be used before any {@link RequestDecorator}-made decorator.
 */
export function Auth(...permissions: string[]) {
  return function (
    target: any,
    propertyKey: string | symbol,
    descriptor: TypedPropertyDescriptor<any>
  ) {
    const handler = descriptor.value;
    descriptor.value = async function <T>(req: AuthReq<T>, res: Res) {
      const authorized = await jwt<T>(req, res, ...permissions);
      return handler.bind(this)(authorized.req, authorized.res);
    };
  };
}
