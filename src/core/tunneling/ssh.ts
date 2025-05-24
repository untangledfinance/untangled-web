import * as ssh2 from 'ssh2';
import fs from 'fs';
import net from 'net';
import { createLogger, Log, Logger } from '../logging';
import { OnStop } from '../ioc';

/**
 * A special port that requires host translation to make it accessible.
 * (Don't ask me the reason I chose this number; it's just a random and
 * easy-to-remember value which doesn't overlap commonly-used ports.)
 */
export const SSH_HOST_TRANSLATION_REQUIRED_PORT = 69;

/**
 * SSH server's authentication context.
 */
export type AuthContext = ssh2.AuthContext;

/**
 * SSH server's initial configurations.
 */
export type ServerConfigurations<T extends AuthContext = AuthContext> = {
  /**
   * Listening address.
   */
  host?: string;
  /**
   * Listening port.
   */
  port?: number;
  /**
   * Path to the host key file.
   */
  hostKeyPath: string;
  /**
   * Authenticates an SSH connection.
   */
  authenticate: (context: T) => Promise<boolean>;
  /**
   * Validates binding for remote forwarding.
   * @param host the remote host to use for forwarding from.
   * @param port the remote port to use for forwarding from.
   */
  validateBind: (context: T, host: string, port: number) => Promise<boolean>;
  /**
   * Validates access for local forwarding.
   * @param host the remote host to access to.
   * @param port the remote port to access to.
   */
  validateAccess: (context: T, host: string, port: number) => Promise<boolean>;
  /**
   * Translates a host to an accessible address (should be used
   * when specified port is {@link SSH_HOST_TRANSLATION_REQUIRED_PORT}).
   * @param host the host.
   * @returns `undefined` when the host could not be translated.
   */
  translateHost?: (
    context: T,
    host: string
  ) => Promise<
    | {
        /**
         * Translated accessible host.
         */
        host: string;
        /**
         * Translated accessible port.
         */
        port: number;
      }
    | undefined
  >;
  /**
   * The message shown when the client connects to the server.
   */
  banner?: string;
};

/**
 * Creates an SSH server that supports remote port forwarding with authentication.
 */
export class Server<T extends AuthContext = AuthContext>
  extends Log(Object, 'SSH')
  implements OnStop
{
  /**
   * Listening address.
   */
  public readonly host: string;
  /**
   * Listening port.
   */
  public readonly port: number;

  /**
   * Embedded SSH server.
   */
  private readonly server: ssh2.Server;

  /**
   * Stores connected user bindings for remote forwarding.
   */
  private readonly binds = {} as {
    [username: string]: {
      host?: string;
      port: number;
    }[];
  };

  /**
   * Retrieve remote forwarding bindings of a specific connected user.
   * @param username the user.
   */
  getBinds(username: string) {
    return this.binds[username] ?? [];
  }

  /**
   * Creates the SSH server with given configurations.
   */
  constructor({
    host = '0.0.0.0',
    port = 2222,
    hostKeyPath,
    authenticate,
    validateBind,
    validateAccess,
    translateHost,
    banner,
  }: ServerConfigurations<T>) {
    super();
    this.host = host;
    this.port = port;
    this.server = new ssh2.Server(
      {
        banner,
        hostKeys: [Buffer.from(fs.readFileSync(hostKeyPath)).toString()],
      },
      (connection) => {
        const client = connection as unknown as ssh2.Connection & {
          context?: T;
          logger?: Logger;
          server?: net.Server;
        };
        client
          .on('error', (err) => {
            const context = client.context;
            const logger = client.logger ?? this.logger;
            if (context) {
              logger.error(
                `Connection failed ${context.username}: ${err.message}\n`,
                err
              );
            } else {
              logger.error(`Connection failed: ${err.message}\n`, err);
            }
            return client.end();
          })
          .on('authentication', async (ctx: T) => {
            if (!(await authenticate(ctx as T))) {
              return ctx.reject();
            }
            client.context = ctx;
            client.logger = createLogger(`ssh-${ctx.username}`);
            return ctx.accept();
          })
          .on('ready', () => {
            const context = client.context;
            const logger = client.logger ?? this.logger;
            logger.debug(`Connection established`);
            client.on('tcpip', async (accept, reject, info) => {
              let destHost = info.destIP;
              let destPort = info.destPort;
              if (
                destPort === SSH_HOST_TRANSLATION_REQUIRED_PORT &&
                translateHost
              ) {
                const translated = await translateHost(context, destHost);
                if (translated) {
                  logger.debug(
                    `Host translated: ${destHost} => ${translated.host}:${translated.port}`
                  );
                  destHost = translated.host ?? destHost;
                  destPort = translated.port ?? destPort;
                }
              }
              const valid = await validateAccess(context, destHost, destPort);
              if (!valid) {
                logger.error(`Access denied to ${destHost}:${destPort}`);
              }
              const socket = net.connect(destPort, destHost, () => {
                const stream = accept();
                socket.pipe(stream).pipe(socket);
                logger.debug(`=> ${destHost}:${destPort}`);
              });
              socket.on('error', (err) => {
                logger.error(`Access failed: ${err.message}\n`, err);
              });
            });
            client.on('request', async (accept, reject, name, info) => {
              if (name === 'tcpip-forward') {
                const valid = await validateBind(
                  context,
                  info.bindAddr,
                  info.bindPort
                );
                if (!valid) {
                  logger.error(`Could not use port ${info.bindPort}`);
                  return client.end();
                }
                const server = net
                  .createServer((socket) => {
                    logger.debug(`Request accepted`);
                    socket.setEncoding('utf8');
                    socket.on('close', () => {
                      logger.debug(`Request closed`);
                    });
                    socket.on('data', (data) => {
                      let dataInterval:
                        | ReturnType<typeof setInterval>
                        | undefined;
                      dataInterval = setInterval(() => {
                        const success = socket.emit('x-data', data);
                        if (success) {
                          clearInterval(dataInterval);
                        }
                      }, 10);
                    });
                    if (!socket.remoteAddress || !socket.remotePort) {
                      logger.error(`Remote address or port invalid:`, {
                        address: socket.remoteAddress ?? null,
                        port: socket.remotePort ?? null,
                      });
                      return socket.end();
                    }
                    client.forwardOut(
                      info.bindAddr,
                      info.bindPort,
                      socket.remoteAddress,
                      socket.remotePort,
                      (err, upstream) => {
                        if (err) {
                          logger.error(
                            `Request forwarding failed: ${err.message}\n`,
                            err
                          );
                          socket.end();
                          return;
                        }
                        socket.on('end', () => upstream.end());
                        socket.on('x-data', (data) => {
                          const success = upstream.write(data);
                          if (!success) {
                            socket.pause();
                            upstream.once('drain', () => socket.resume());
                          }
                        });
                        upstream.on('data', (data: any) => {
                          const success = socket.write(data);
                          if (!success) {
                            upstream.pause();
                            socket.once('drain', () => upstream.resume());
                          }
                        });
                        upstream.on('end', () => socket.end());
                        upstream.on('close', () => {
                          logger.debug(`Upstream closed`);
                        });
                        upstream.on('error', (err: any) => {
                          logger.error(`Upstream error: ${err.message}\n`, err);
                        });
                      }
                    );
                  })
                  .listen(info.bindPort, info.bindAddr, () => {
                    const contextBinds = this.binds[context.username] ?? [];
                    this.binds[context.username] = [
                      ...contextBinds,
                      {
                        host: info.bindAddr,
                        port: info.bindPort,
                      },
                    ];
                    logger.debug(
                      `Started forwarding from ${info.bindAddr}:${info.bindPort}`
                    );
                  })
                  .on('close', () => {
                    const contextBinds = (
                      this.binds[context.username] ?? []
                    ).filter(({ host, port }) => {
                      return host !== info.bindAddr && port !== info.bindPort;
                    });
                    this.binds[context.username] = [...contextBinds];
                    logger.debug(`Connection closed`);
                  });
                client.server = server;
                return accept!();
              }
              return reject!();
            });
            client.on('error', (err) => {
              logger.error(`${err.message}\n`, err);
            });
            client.on('close', () => {
              logger.debug(`Connection closed`);
              client.server?.close();
              client.end();
            });
          });
      }
    );
  }

  /**
   * Starts the SSH server.
   * @param onStart a callback executed when the server starts.
   */
  start(onStart?: () => void) {
    this.server.listen(this.port, this.host, () => {
      this.logger.debug('SSH server started', {
        host: this.host,
        port: this.port,
      });
      onStart?.();
    });
  }

  /**
   * Stops the SSH server.
   * @param onStop a callback executed when the server stops.
   */
  stop(onStop?: () => void) {
    this.server.close((err) => {
      if (err) {
        this.logger.error(
          `Failed on stopping SSH server: ${err.message}\n`,
          err
        );
      } else {
        this.logger.debug('SSH server stopped');
        onStop?.();
      }
    });
  }

  async onStop() {
    this.stop();
  }

  /**
   * Tries to retrieve an SSH public key.
   * @param data given data.
   * @throws an error when parsing failed.
   */
  static parsePublicKey(data: Buffer) {
    const parsedKey = ssh2.utils.parseKey(data);
    if (parsedKey instanceof Error) {
      throw parsedKey;
    }
    return {
      type: parsedKey.type,
      publicKey: parsedKey.getPublicSSH(),
    };
  }
}
