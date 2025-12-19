import {
  createCacheDecorator,
  createLockDecorator,
  createRequestCacheDecorator,
} from 'untangled-web/boot/decorators';

export const Cache = createCacheDecorator(() => Configs);
export const ReqCache = createRequestCacheDecorator(() => Configs);
export const Lock = createLockDecorator(() => Configs);
