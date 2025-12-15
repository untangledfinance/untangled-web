import { Context } from '../context';

type Event<T = any> = {
  /**
   * The event type.
   */
  key: string;
  /**
   * The event data.
   */
  data: T;
};

/**
 * Function to handle a given event.
 */
type EventHandler<T = any, R = any> = (e?: Event<T>) => R | Promise<R>;

/**
 * Contains functions to handle all available events.
 */
const EventContext = Context.for<
  {
    /**
     * The event type.
     */
    key: string;
    /**
     * Handles the given event.
     */
    handler: EventHandler;
  }[]
>('EventContext', []);

/**
 * Emits an event to the {@link EventContext} to trigger its handlers.
 * @param event type of the event.
 * @param data data to emit.
 * @param onError to handle error thrown when emitting.
 * @see on
 * @returns the number of triggered handlers.
 */
export function emit<T = any>(
  event: string,
  data?: T,
  onError?: (err: Error) => void
) {
  const handlers = EventContext.getOrThrow()
    .filter(
      ({ key, handler }) => event === key && typeof handler === 'function'
    )
    .map(({ handler }) => handler);
  setImmediate(async () =>
    Promise.all(
      handlers.map(async (h) => {
        try {
          return h({
            key: event,
            data,
          });
        } catch (err) {
          if (onError) onError(err);
          else throw err;
        }
      })
    )
  );
  return handlers.length;
}

/**
 * Registers a function to handle a specific event.
 * @param event type of the event.
 * @param handler the function to handle the event.
 * @returns a function to unregister the function from handling the event.
 * @see emit
 */
export function on<T = any, R = any>(
  event: string,
  handler: EventHandler<T, R>
) {
  EventContext.set([
    ...EventContext.getOrThrow(),
    {
      key: event,
      handler,
    },
  ]);
  /**
   * Unregisters the function from handling the event.
   */
  return function clean() {
    const handlers = EventContext.getOrThrow();
    const handlerIndex = handlers.findIndex(
      (h) => h.key === event && h.handler === handler
    );
    if (handlerIndex >= 0) {
      const newHandlers = [...handlers];
      newHandlers.splice(handlerIndex, 1);
      EventContext.set(newHandlers);
    }
  };
}
