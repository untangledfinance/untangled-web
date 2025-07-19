import * as redis from 'redis';
import {
  Producer,
  Consumer,
  Broker,
  Cluster,
  ProducerConfig,
  ConsumerConfig,
  BrokerConfig,
  ProducedMessage,
  ConsumedMessage,
  ProduceRequest,
  ProduceResponse,
  ConsumeResponse,
  OffsetCommitRequest,
  TopicMetadata,
  PartitionInfo,
  ProducerError,
  ConsumerError,
  BrokerError,
  TopicNotFoundError,
  PartitionNotFoundError,
  ClusterError,
} from '../../core/pubsub';
import { OnInit, OnStop } from '../../core/ioc';
import * as utils from './utils';
import { createLogger } from '../../core/logging';

const logger = createLogger('RedisPubSub');

/**
 * Redis client configurations.
 */
export type RedisOptions = {
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  database?: number;
};

export class RedisProducer extends Producer implements OnInit, OnStop {
  private readonly client: redis.RedisClientType;
  private connected: boolean = false;

  constructor(config: ProducerConfig) {
    super(config);
    this.client = redis.createClient({
      url: this.config.bootstrapServers[0],
    });
  }

  async connect() {
    try {
      await this.client.connect();
      this.connected = true;
    } catch (err) {
      throw new ProducerError(`Failed to connect: ${err.messsage}`);
    }
  }

  async disconnect() {
    if (this.connected) {
      await this.client.disconnect();
      this.connected = false;
    }
  }

  async onInit() {
    await this.connect();
  }

  async onStop() {
    await this.client.disconnect();
  }

  async send(request: ProduceRequest): Promise<ProduceResponse> {
    if (!this.connected) {
      throw new ProducerError('Producer not connected');
    }

    // Get topic metadata to determine partition count
    const topicInfo = await this.client.hGetAll(`topic:${request.topic}`);
    if (!topicInfo.partitions) {
      throw new TopicNotFoundError(request.topic);
    }

    const partitionCount = parseInt(topicInfo.partitions);
    const producedMessages: ProducedMessage[] = [];

    for (const message of request.messages) {
      // Determine partition
      let partition = request.partition;
      if (partition === undefined) {
        if (message.key) {
          partition = utils.hashPartition(message.key, partitionCount);
        } else {
          partition = Math.floor(Math.random() * partitionCount);
        }
      }

      if (partition >= partitionCount) {
        throw new PartitionNotFoundError(request.topic, partition);
      }

      const streamKey = utils.getPartitionKey(request.topic, partition);
      const messageId = utils.generateId();
      const timestamp = message.timestamp || Date.now();

      // Prepare stream entry
      const streamEntry: Record<string, string> = {
        id: messageId,
        key: message.key || '',
        value: JSON.stringify(message.value),
        timestamp: timestamp.toString(),
      };

      // Add headers if present
      if (message.headers) {
        streamEntry.headers = JSON.stringify(message.headers);
      }

      // Add to Redis Stream
      const offset = await this.client.xAdd(streamKey, '*', streamEntry);

      const producedMessage: ProducedMessage = {
        ...message,
        id: messageId,
        partition,
        offset,
        timestamp,
      };

      producedMessages.push(producedMessage);

      await this.handleReplication(request.topic, partition, producedMessage);
    }

    return {
      topic: request.topic,
      partition: producedMessages[0].partition,
      baseOffset: producedMessages[0].offset,
      messages: producedMessages,
    };
  }

  private async handleReplication(
    topic: string,
    partition: number,
    message: ProducedMessage
  ) {
    // Get replica information
    const partitionInfo = await this.client.hGetAll(
      `partition:${topic}:${partition}`
    );
    const replicas = JSON.parse(partitionInfo.replicas || '[]');

    // Replicate to all replicas (simplified)
    for (const replica of replicas) {
      const replicaKey = `${utils.getPartitionKey(topic, partition)}:replica:${replica}`;
      await this.client.xAdd(replicaKey, message.offset, {
        id: message.id,
        key: message.key || '',
        value: JSON.stringify(message.value),
        timestamp: message.timestamp.toString(),
        headers: JSON.stringify(message.headers || {}),
      });
    }
  }

  async flush() {
    // In Redis Streams, messages are immediately persisted
    // This method is for compatibility with Kafka-like interface
  }
}

export class RedisConsumer extends Consumer implements OnInit, OnStop {
  private readonly client: redis.RedisClientType;
  private connected: boolean = false;
  private subscribedTopics: string[] = [];
  private consumerName: string;
  private lastOffsets: Map<string, string> = new Map();

  constructor(config: ConsumerConfig) {
    super(config);
    this.client = redis.createClient({
      url: this.config.bootstrapServers[0],
    });
    this.consumerName = `${this.config.clientId}-${utils.generateId()}`;
  }

  async connect() {
    try {
      await this.client.connect();
      this.connected = true;
    } catch (err) {
      throw new ConsumerError(`Failed to connect: ${err.messsage}`);
    }
  }

  async disconnect() {
    if (this.connected) {
      await this.client.disconnect();
      this.connected = false;
    }
  }

  async onInit() {
    await this.connect();
  }

  async onStop() {
    await this.disconnect();
  }

  async subscribe(topics: string[]) {
    if (!this.connected) {
      throw new ConsumerError('Consumer not connected');
    }

    this.subscribedTopics = topics;

    // Create consumer groups for each topic partition
    for (const topic of topics) {
      const topicInfo = await this.client.hGetAll(`topic:${topic}`);
      if (!topicInfo.partitions) {
        throw new TopicNotFoundError(topic);
      }

      const partitionCount = parseInt(topicInfo.partitions);
      for (let partition = 0; partition < partitionCount; partition++) {
        const streamKey = utils.getPartitionKey(topic, partition);

        try {
          // Create consumer group (XGROUP CREATE)
          await this.client.xGroupCreate(streamKey, this.config.groupId, '$', {
            MKSTREAM: true,
          });
        } catch (err) {
          // Group might already exist, ignore error
        }

        // Set initial offset based on configuration
        if (this.config.autoOffsetReset === 'earliest') {
          this.lastOffsets.set(`${topic}:${partition}`, '0');
        } else {
          this.lastOffsets.set(`${topic}:${partition}`, '$');
        }
      }
    }
  }

  async unsubscribe() {
    this.subscribedTopics = [];
    this.lastOffsets.clear();
  }

  async poll(timeout: number = 5000): Promise<ConsumeResponse> {
    if (!this.connected || this.subscribedTopics.length === 0) {
      return { messages: [] };
    }

    const messages: ConsumedMessage[] = [];
    const maxMessages = this.config.maxPollRecords || 100;

    for (const topic of this.subscribedTopics) {
      const topicInfo = await this.client.hGetAll(`topic:${topic}`);
      const partitionCount = parseInt(topicInfo.partitions);

      for (let partition = 0; partition < partitionCount; partition++) {
        const streamKey = utils.getPartitionKey(topic, partition);

        try {
          // Read from consumer group
          const results = await this.client.xReadGroup(
            this.config.groupId,
            this.consumerName,
            { key: streamKey, id: '>' },
            {
              COUNT: Math.min(maxMessages - messages.length, 10),
              BLOCK: Math.floor(
                timeout / this.subscribedTopics.length / partitionCount
              ),
            }
          );

          if (results) {
            for (const result of results) {
              for (const message of result.messages) {
                const consumedMessage: ConsumedMessage = {
                  id: message.message.id,
                  key: message.message.key || undefined,
                  value: JSON.parse(message.message.value),
                  headers: message.message.headers
                    ? JSON.parse(message.message.headers)
                    : undefined,
                  timestamp: parseInt(message.message.timestamp),
                  partition,
                  offset: message.id,
                  topic,
                  consumerId: this.consumerName,
                  consumerGroup: this.config.groupId,
                };

                messages.push(consumedMessage);
                this.lastOffsets.set(`${topic}:${partition}`, message.id);

                if (messages.length >= maxMessages) {
                  break;
                }
              }
            }
          }
        } catch (err) {
          logger.warn(
            `Error polling topic ${topic} partition ${partition}:`,
            err.messsage
          );
        }

        if (messages.length >= maxMessages) {
          break;
        }
      }

      if (messages.length >= maxMessages) {
        break;
      }
    }

    // Auto-commit if enabled
    if (this.config.enableAutoCommit && messages.length > 0) {
      setTimeout(
        () => this.commitAsync(),
        this.config.autoCommitInterval || 5000
      );
    }

    return { messages };
  }

  async commitSync(offsets?: OffsetCommitRequest[]) {
    if (!offsets) {
      offsets = this.getOffsetsToCommit();
    }

    for (const offset of offsets) {
      const streamKey = utils.getPartitionKey(offset.topic, offset.partition);
      await this.client.xAck(streamKey, this.config.groupId, offset.offset);
    }
  }

  async commitAsync(offsets?: OffsetCommitRequest[]) {
    return this.commitSync(offsets);
  }

  async seek(topic: string, partition: number, offset: string) {
    this.lastOffsets.set(`${topic}:${partition}`, offset);
  }

  private getOffsetsToCommit(): OffsetCommitRequest[] {
    const offsets: OffsetCommitRequest[] = [];
    for (const [key, offset] of this.lastOffsets) {
      const [topic, partition] = key.split(':');
      offsets.push({
        topic,
        partition: parseInt(partition),
        offset,
      });
    }
    return offsets;
  }
}

export class RedisBroker extends Broker implements OnInit, OnStop {
  private readonly client: redis.RedisClientType;
  private running: boolean = false;

  constructor(config: BrokerConfig & RedisOptions) {
    super(config);
    this.client = redis.createClient({
      url: `redis://${config.host}:${config.port}`,
      username: config.username,
      password: config.password,
      database: config.database,
    });
  }

  async start() {
    try {
      await this.client.connect();
      this.running = true;
      await this.client.hSet(
        'brokers',
        this.config.brokerId,
        JSON.stringify({
          brokerId: this.config.brokerId,
          host: this.config.host,
          port: this.config.port,
          timestamp: Date.now(),
        })
      );
      logger.debug(`Broker ${this.config.brokerId} started`);
    } catch (err) {
      throw new BrokerError(`Failed to start broker: ${err.messsage}`);
    }
  }

  async stop() {
    if (this.running) {
      await this.client.hDel('brokers', this.config.brokerId);
      await this.client.disconnect();
      this.running = false;
      logger.debug(`Broker ${this.config.brokerId} stopped`);
    }
  }

  async onInit() {
    await this.start();
  }

  async onStop() {
    await this.stop();
  }

  async createTopic(
    name: string,
    partitions: number,
    replicationFactor: number
  ) {
    if (!this.running) {
      throw new BrokerError('Broker not running');
    }

    const topicKey = `topic:${name}`;

    const exists = await this.client.exists(topicKey);
    if (exists) {
      throw new BrokerError(`Topic ${name} already exists`);
    }

    // Create topic metadata
    await this.client.hSet(topicKey, {
      name,
      partitions: partitions.toString(),
      replicationFactor: replicationFactor.toString(),
      createdAt: Date.now().toString(),
    });

    // Create partition metadata and assign leaders
    const brokers = await this.client.hKeys('brokers');
    for (let partition = 0; partition < partitions; partition++) {
      const leader = brokers[partition % brokers.length];
      const replicas = this.selectReplicas(
        brokers,
        leader,
        Math.min(replicationFactor, brokers.length)
      );

      await this.client.hSet(`partition:${name}:${partition}`, {
        partition: partition.toString(),
        leader,
        replicas: JSON.stringify(replicas),
        inSyncReplicas: JSON.stringify(replicas),
      });

      // Create the stream
      const streamKey = utils.getPartitionKey(name, partition);
      await this.client.xAdd(streamKey, '*', { init: 'true' });
      const messageIds = (
        await this.client.xRange(streamKey, '-', '+', { COUNT: 1 })
      ).map(({ id }) => id);
      await this.client.xDel(streamKey, messageIds);
    }

    logger.debug(
      `Topic ${name} created with ${partitions} partitions and replication factor ${replicationFactor}`
    );
  }

  async deleteTopic(name: string) {
    if (!this.running) {
      throw new BrokerError('Broker not running');
    }

    const topicKey = `topic:${name}`;
    const topicInfo = await this.client.hGetAll(topicKey);

    if (!topicInfo.partitions) {
      throw new TopicNotFoundError(name);
    }

    const partitionCount = parseInt(topicInfo.partitions);

    // Delete all partition streams and metadata
    for (let partition = 0; partition < partitionCount; partition++) {
      const streamKey = utils.getPartitionKey(name, partition);
      await this.client.del(streamKey);
      await this.client.del(`partition:${name}:${partition}`);
    }

    // Delete topic metadata
    await this.client.del(topicKey);

    logger.debug(`Topic ${name} deleted`);
  }

  async getTopicMetadata(name: string): Promise<TopicMetadata> {
    const topicInfo = await this.client.hGetAll(`topic:${name}`);

    if (!topicInfo.partitions) {
      throw new TopicNotFoundError(name);
    }

    const partitionCount = parseInt(topicInfo.partitions);
    const partitions: PartitionInfo[] = [];

    for (let partition = 0; partition < partitionCount; partition++) {
      const partitionInfo = await this.client.hGetAll(
        `partition:${name}:${partition}`
      );
      partitions.push({
        partition,
        leader: partitionInfo.leader,
        replicas: JSON.parse(partitionInfo.replicas || '[]'),
        inSyncReplicas: JSON.parse(partitionInfo.inSyncReplicas || '[]'),
      });
    }

    return {
      name,
      partitions,
    };
  }

  async listTopics(): Promise<string[]> {
    const keys = await this.client.keys('topic:*');
    return keys.map((key) => key.replace('topic:', ''));
  }

  private selectReplicas(
    brokers: string[],
    leader: string,
    count: number
  ): string[] {
    const replicas = [leader];
    const availableBrokers = brokers.filter((b) => b !== leader);
    for (let i = 0; i < Math.min(count - 1, availableBrokers.length); i++) {
      replicas.push(availableBrokers[i]);
    }
    return replicas;
  }
}

export class RedisCluster extends Cluster implements OnInit, OnStop {
  private readonly client: redis.RedisClientType;
  private connected: boolean = false;

  constructor({
    host = 'localhost',
    port = 6379,
    username,
    password,
    database = 0,
  }: RedisOptions = {}) {
    super();
    this.client = redis.createClient({
      url: `redis://${host}:${port}`,
      username,
      password,
      database,
    });
  }

  async connect() {
    try {
      await this.client.connect();
      this.connected = true;
    } catch (err) {
      throw new ClusterError(`Failed to connect: ${err.messsage}`);
    }
  }

  async disconnect() {
    if (this.connected) {
      await this.client.disconnect();
      this.connected = false;
    }
  }

  async onInit() {
    await this.connect();
  }

  async onStop() {
    await this.disconnect();
  }

  async addBroker(broker: Broker) {
    await broker.start();
    this.brokers.set(broker['config'].brokerId, broker);
  }

  async removeBroker(brokerId: string) {
    const broker = this.brokers.get(brokerId);
    if (broker) {
      await broker.stop();
      this.brokers.delete(brokerId);
    }
  }

  getBroker(brokerId: string): Broker | undefined {
    return this.brokers.get(brokerId);
  }

  async getLeaderForPartition(
    topic: string,
    partition: number
  ): Promise<string> {
    const partitionInfo = await this.client.hGetAll(
      `partition:${topic}:${partition}`
    );
    if (!partitionInfo.leader) {
      throw new PartitionNotFoundError(topic, partition);
    }
    return partitionInfo.leader;
  }

  async electLeader(topic: string, partition: number): Promise<string> {
    const partitionInfo = await this.client.hGetAll(
      `partition:${topic}:${partition}`
    );
    const replicas = JSON.parse(partitionInfo.replicas || '[]');

    if (replicas.length === 0) {
      throw new BrokerError(`No replicas available for ${topic}:${partition}`);
    }

    // Simple leader election - pick first available replica
    const availableBrokers = await this.client.hKeys('brokers');
    const newLeader = replicas.find((replica: string) =>
      availableBrokers.includes(replica)
    );

    if (!newLeader) {
      throw new BrokerError(`No available replicas for ${topic}:${partition}`);
    }

    await this.client.hSet(
      `partition:${topic}:${partition}`,
      'leader',
      newLeader
    );
    return newLeader;
  }

  async replicateMessage(
    topic: string,
    partition: number,
    message: ProducedMessage
  ) {
    const partitionInfo = await this.client.hGetAll(
      `partition:${topic}:${partition}`
    );
    const replicas = JSON.parse(partitionInfo.replicas || '[]');

    // Replicate to all replicas
    const replicationPromises = replicas.map(async (replica: string) => {
      if (replica !== partitionInfo.leader) {
        const replicaKey = `${utils.getPartitionKey(topic, partition)}:replica:${replica}`;
        await this.client.xAdd(replicaKey, message.offset, {
          id: message.id,
          key: message.key || '',
          value: JSON.stringify(message.value),
          timestamp: message.timestamp.toString(),
          headers: JSON.stringify(message.headers || {}),
        });
      }
    });

    await Promise.all(replicationPromises);
  }
}
