import { Action, Role } from '../types';

const ALL = '*';
const PERM_SEP = ':';

/**
 * Access-Control List.
 */
type Acl = {
  [role: string]: string[];
};

/**
 * Access-Control Map.
 */
type Acm = {
  [role: string]: {
    [resource: string]: {
      [action: string]: boolean;
    };
  };
};

/**
 * An access-Control validator.
 */
export class RbacValidator {
  private readonly acm: Acm;
  public readonly enabled: boolean;

  constructor(acl: Acl = {}, enabled = false) {
    this.enabled = enabled;
    const map = {};
    for (const role in acl) {
      map[role] = map[role] ?? {};
      if ((acl[role] as unknown as string) === ALL) {
        map[role][ALL] = {
          [ALL]: true,
        };
        continue;
      }
      for (const perm of acl[role]) {
        const [resource, action] =
          perm === ALL ? [ALL, ALL] : perm.split(PERM_SEP);
        map[role][resource] = {
          ...(map[role][resource] ?? {}),
          [action]: true,
        };
      }
    }
    this.acm = map;
  }

  /**
   * Checks if a resource can be accessed by a specific {@link Role}
   * with a given {@link Action}.
   * @param perm concatenation of the resource name and the {@link Action}.
   * @param role the {@link Role}.
   * @returns `true` if it can be; otherwise, `false`.
   */
  check(perm: string, role: Role) {
    if (!this.enabled) {
      throw new Error('Validator disabled');
    }
    const [resource, action] = perm.split(PERM_SEP);
    if (
      this.acm[role]?.[ALL]?.[ALL] ||
      this.acm[role]?.[ALL]?.[action] ||
      this.acm[role]?.[resource]?.[ALL]
    ) {
      return true;
    }
    return !!this.acm[role]?.[resource]?.[action];
  }
}
