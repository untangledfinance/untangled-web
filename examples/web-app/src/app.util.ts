import {
  createCacheDecorator,
  createRequestCacheDecorator,
} from 'untangled-web/boot/decorators';

export const Cache = createCacheDecorator(() => Configs);
export const ReqCache = createRequestCacheDecorator(() => Configs);
