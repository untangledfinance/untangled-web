/**
 * Validates the current step of an instance before its method invocation.
 * An {@link Error} is thrown when the instance's current step is greater
 * than the method's order. The current step of the instance is updated
 * if the check passes.
 * @param order the order of this method.
 */
export function Step(order: number) {
  if (order < 0) {
    throw new Error('Step must be greater than 0');
  }
  return function (
    target: any,
    propertyKey: string | symbol,
    descriptor: TypedPropertyDescriptor<any>
  ) {
    const method = descriptor.value;
    descriptor.value = function (...args: any[]) {
      const step = (this._step as number) ?? 0;
      if (step > order) {
        throw new Error(
          `Could not take action ${order} (current step: ${step})`
        );
      }
      this._step = order;
      return method.apply(this, args);
    };
    return descriptor;
  };
}

/**
 * Makes a method invocable only when a specific condition is met.
 * @param condition the condition.
 * @param message to specify message of the thrown {@link Error}.
 * @throws an {@link Error} if the condition is not fulfilled.
 */
export function When(
  condition: Promise<boolean> | boolean | (() => Promise<boolean> | boolean),
  message?: string
) {
  return function (
    target: any,
    propertyKey: string | symbol,
    descriptor: TypedPropertyDescriptor<any>
  ) {
    const func = descriptor.value;
    descriptor.value = async function (...args: any[]) {
      const activation: boolean | Promise<boolean> =
        condition instanceof Function ? condition.bind(this)() : condition;
      const activated =
        activation instanceof Promise ? await activation : activation;
      if (activated) {
        return func.bind(this)(...args);
      }
      throw new Error(message);
    };
  };
}

/**
 * Catches error thrown when executing a specific method.
 * @param handler the error handler that also returns data for the method.
 * @param options catching options.
 */
export function Catch(
  handler?: (err: any, ...args: any[]) => any,
  options?: {
    /**
     * Errors that don't need to be caught.
     */
    skips: Class<any> | Class<any>[];
  }
) {
  const skips = [options?.skips ?? []].flat();
  return function (
    target: any,
    propertyKey: string | symbol,
    descriptor: TypedPropertyDescriptor<any>
  ) {
    const func = descriptor.value;
    descriptor.value = function (...args: any[]) {
      try {
        return func.bind(this)(...args);
      } catch (err) {
        const skipped = skips.some((errType) => err instanceof errType);
        if (skipped) throw err;
        return handler?.bind(this)?.(err, ...args);
      }
    };
  };
}
