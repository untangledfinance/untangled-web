import { Context } from '../context';

export type Event<T = any> = {
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
 * Emits an {@link Event} to the {@link EventContext} to trigger its handlers.
 * @param e the {@link Event}.
 * @param onError to handle error thrown when emitting.
 * @see On
 * @returns the number of triggered handlers.
 */
export function emit<T = any>(e: Event<T>, onError?: (err: Error) => void) {
  const handlers = EventContext.get()
    .filter(
      ({ key, handler }) => e.key === key && typeof handler === 'function'
    )
    .map(({ handler }) => handler);
  setImmediate(async () => {
    await Promise.all(handlers.map((h) => h(e).catch(onError)));
  });
  return handlers.length;
}

/**
 * Registers a function to handle a specific {@link Event}.
 * @param event type of the {@link Event}.
 */
export function On(event: string) {
  return function <T extends Function>(handler: T) {
    EventContext.set([
      ...EventContext.get(),
      {
        key: event,
        handler: async (e) => handler(e),
      },
    ]);
    return handler;
  };
}
