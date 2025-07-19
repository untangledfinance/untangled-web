/**
 * Represents a generic message to be published or consumed.
 */
export interface Message {
  key?: string;
  value: any;
  headers?: Record<string, string>;
  timestamp?: number;
}

/**
 * Represents a message that has been produced and assigned an ID, partition, and offset.
 */
export interface ProducedMessage extends Message {
  id: string;
  partition: number;
  offset: string;
  timestamp: number;
}

/**
 * Represents a message that has been consumed, including topic and consumer info.
 */
export interface ConsumedMessage extends ProducedMessage {
  topic: string;
  consumerId?: string;
  consumerGroup?: string;
}

/**
 * Metadata for a topic partition.
 */
export interface PartitionInfo {
  partition: number;
  leader: string;
  replicas: string[];
  inSyncReplicas: string[];
}

/**
 * Metadata for a topic, including all partitions.
 */
export interface TopicMetadata {
  name: string;
  partitions: PartitionInfo[];
}

/**
 * Configuration for a producer client.
 */
export interface ProducerConfig {
  clientId: string;
  bootstrapServers: string[];
  acks?: 'all' | 'leader' | 'none';
  retries?: number;
  batchSize?: number;
  linger?: number;
  maxInFlightRequests?: number;
}

/**
 * Configuration for a consumer client.
 */
export interface ConsumerConfig {
  clientId: string;
  groupId: string;
  bootstrapServers: string[];
  autoOffsetReset?: 'earliest' | 'latest';
  enableAutoCommit?: boolean;
  autoCommitInterval?: number;
  maxPollRecords?: number;
  sessionTimeout?: number;
}

/**
 * Configuration for a broker node.
 */
export interface BrokerConfig {
  brokerId: string;
  host: string;
  port: number;
  replicationFactor?: number;
  logRetentionHours?: number;
  logSegmentBytes?: number;
}

/**
 * Request to produce messages to a topic/partition.
 */
export interface ProduceRequest {
  topic: string;
  partition?: number;
  messages: Message[];
}

/**
 * Response from a produce operation.
 */
export interface ProduceResponse {
  topic: string;
  partition: number;
  baseOffset: string;
  messages: ProducedMessage[];
}

/**
 * Response from a consume operation.
 */
export interface ConsumeResponse {
  messages: ConsumedMessage[];
}

/**
 * Request to commit an offset for a topic/partition.
 */
export interface OffsetCommitRequest {
  topic: string;
  partition: number;
  offset: string;
}

/**
 * Abstract producer for publishing messages to a topic.
 */
export abstract class Producer {
  protected config: ProducerConfig;

  constructor(config: ProducerConfig) {
    this.config = config;
  }

  /**
   * Connects the producer to the broker cluster.
   */
  abstract connect(): Promise<void>;
  /**
   * Disconnects the producer from the broker cluster.
   */
  abstract disconnect(): Promise<void>;
  /**
   * Sends messages to a topic/partition.
   * @param request produce request containing topic, partition, and messages.
   */
  abstract send(request: ProduceRequest): Promise<ProduceResponse>;
  /**
   * Flushes any buffered messages.
   */
  abstract flush(): Promise<void>;
}

/**
 * Abstract consumer for subscribing and consuming messages from topics.
 */
export abstract class Consumer {
  protected config: ConsumerConfig;

  constructor(config: ConsumerConfig) {
    this.config = config;
  }

  /**
   * Connects the consumer to the broker cluster.
   */
  abstract connect(): Promise<void>;
  /**
   * Disconnects the consumer from the broker cluster.
   */
  abstract disconnect(): Promise<void>;
  /**
   * Subscribes to one or more topics.
   * @param topics list of topic names to subscribe to.
   */
  abstract subscribe(topics: string[]): Promise<void>;
  /**
   * Unsubscribes from all topics.
   */
  abstract unsubscribe(): Promise<void>;
  /**
   * Polls for new messages from subscribed topics.
   * @param timeout optional poll timeout in milliseconds.
   */
  abstract poll(timeout?: number): Promise<ConsumeResponse>;
  /**
   * Synchronously commits offsets for the given topics/partitions.
   * @param offsets optional list of offsets to commit.
   */
  abstract commitSync(offsets?: OffsetCommitRequest[]): Promise<void>;
  /**
   * Asynchronously commits offsets for the given topics/partitions.
   * @param offsets optional list of offsets to commit.
   */
  abstract commitAsync(offsets?: OffsetCommitRequest[]): Promise<void>;
  /**
   * Seeks to a specific offset for a topic/partition.
   * @param topic topic name.
   * @param partition partition number.
   * @param offset offset to seek to.
   */
  abstract seek(
    topic: string,
    partition: number,
    offset: string
  ): Promise<void>;
}

/**
 * Abstract broker for managing topics and partitions.
 */
export abstract class Broker {
  protected config: BrokerConfig;

  constructor(config: BrokerConfig) {
    this.config = config;
  }

  /**
   * Starts the broker service.
   */
  abstract start(): Promise<void>;
  /**
   * Stops the broker service.
   */
  abstract stop(): Promise<void>;
  /**
   * Creates a new topic with the given number of partitions and replication factor.
   * @param name topic name.
   * @param partitions number of partitions.
   * @param replicationFactor replication factor.
   */
  abstract createTopic(
    name: string,
    partitions: number,
    replicationFactor: number
  ): Promise<void>;
  /**
   * Deletes a topic.
   * @param name topic name.
   */
  abstract deleteTopic(name: string): Promise<void>;
  /**
   * Retrieves metadata for a topic.
   * @param name topic name.
   */
  abstract getTopicMetadata(name: string): Promise<TopicMetadata>;
  /**
   * Lists all topics managed by the broker.
   */
  abstract listTopics(): Promise<string[]>;
}

/**
 * Abstract cluster for managing a group of brokers.
 */
export abstract class Cluster {
  protected brokers: Map<string, Broker> = new Map();

  /**
   * Adds a broker to the cluster.
   * @param broker broker instance to add.
   */
  abstract addBroker(broker: Broker): Promise<void>;
  /**
   * Removes a broker from the cluster by ID.
   * @param brokerId broker ID to remove.
   */
  abstract removeBroker(brokerId: string): Promise<void>;
  /**
   * Gets a broker by ID.
   * @param brokerId broker ID.
   */
  abstract getBroker(brokerId: string): Broker | undefined;
  /**
   * Gets the leader broker ID for a topic partition.
   * @param topic topic name.
   * @param partition partition number.
   */
  abstract getLeaderForPartition(
    topic: string,
    partition: number
  ): Promise<string>;
  /**
   * Elects a new leader for a topic partition.
   * @param topic topic name.
   * @param partition partition number.
   */
  abstract electLeader(topic: string, partition: number): Promise<string>;
  /**
   * Replicates a message to a partition.
   * @param topic topic name.
   * @param partition partition number.
   * @param message message to replicate.
   */
  abstract replicateMessage(
    topic: string,
    partition: number,
    message: ProducedMessage
  ): Promise<void>;
}

/**
 * Error thrown by a producer.
 */
export class ProducerError extends Error {
  constructor(
    message: string,
    public readonly code?: string
  ) {
    super(message);
    this.name = 'ProducerError';
  }
}

/**
 * Error thrown by a consumer.
 */
export class ConsumerError extends Error {
  constructor(
    message: string,
    public readonly code?: string
  ) {
    super(message);
    this.name = 'ConsumerError';
  }
}

/**
 * Error thrown by a broker.
 */
export class BrokerError extends Error {
  constructor(
    message: string,
    public readonly code?: string
  ) {
    super(message);
    this.name = 'BrokerError';
  }
}

/**
 * Error thrown by a cluster.
 */
export class ClusterError extends Error {
  constructor(
    message: string,
    public readonly code?: string
  ) {
    super(message);
    this.name = 'ClusterError';
  }
}

/**
 * Error thrown when a topic is not found.
 */
export class TopicNotFoundError extends Error {
  constructor(topic: string) {
    super(`Topic '${topic}' not found`);
    this.name = 'TopicNotFoundError';
  }
}

/**
 * Error thrown when a partition is not found for a topic.
 */
export class PartitionNotFoundError extends Error {
  constructor(topic: string, partition: number) {
    super(`Partition ${partition} not found for topic '${topic}'`);
    this.name = 'PartitionNotFoundError';
  }
}
