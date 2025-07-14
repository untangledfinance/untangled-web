export class BaseEntity<T> {
  constructor(target?: Partial<T>) {
    if (target) {
      Object.assign(this, target);
    }
  }
}
