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

type EventHandler<T = any, R = any> = (e?: Event<T>) => Promise<R>;

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
 * @see On
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
      handlers.map((h) =>
        h({
          key: event,
          data,
        }).catch(onError)
      )
    )
  );
  return handlers.length;
}

/**
 * Registers a function to handle a specific event.
 * @param event type of the event.
 */
export function On(event: string) {
  return function <T extends Function>(handler: T) {
    EventContext.set([
      ...EventContext.getOrThrow(),
      {
        key: event,
        handler: async (e) => handler(e),
      },
    ]);
    return handler;
  };
}
