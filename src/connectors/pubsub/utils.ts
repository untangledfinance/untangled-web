export function generateId(): string {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

export function getPartitionKey(topic: string, partition: number): string {
  return `${topic}:${partition}`;
}

export function getConsumerGroupKey(
  topic: string,
  partition: number,
  groupId: string
): string {
  return `${topic}:${partition}:${groupId}`;
}

export function hashPartition(key: string, partitionCount: number): number {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = ((hash << 5) - hash + key.charCodeAt(i)) & 0xffffffff;
  }
  return Math.abs(hash) % partitionCount;
}
