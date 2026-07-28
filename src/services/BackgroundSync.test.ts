/**
 * [wb修改] BackgroundSync.test.ts
 * 验证：WiFi 守卫逻辑、任务 handler 在 WiFi/非WiFi/异常下的分支、
 *       注册幂等、手动授权入口。全部依赖注入，不依赖 jest 对原生模块 mock。
 */

jest.mock('expo-background-fetch');
jest.mock('expo-task-manager');

import {
  BACKGROUND_SYNC_TASK,
  isWifiOnly,
  guardWifiOnly,
  runBackgroundSyncHandler,
  registerBackgroundSync,
  unregisterBackgroundSync,
  isBackgroundSyncEnabled,
  enableBackgroundSync,
  type NetworkType,
} from './BackgroundSync';

// ---- 假依赖 ----
function makeFakeBackgroundFetch() {
  const BackgroundFetchResult = { NewData: 'new', NoData: 'no', Failed: 'fail' } as const;
  const registerTaskAsync = jest.fn(() => {
    (state as { registered: boolean }).registered = true;
    return Promise.resolve();
  });
  const unregisterTaskAsync = jest.fn(() => {
    (state as { registered: boolean }).registered = false;
    return Promise.resolve();
  });
  return { BackgroundFetchResult, registerTaskAsync, unregisterTaskAsync };
}

const state = { registered: false };
function makeFakeTaskManager() {
  return {
    isTaskRegisteredAsync: jest.fn(() => Promise.resolve(state.registered)),
    defineTask: jest.fn(),
  };
}

const fakeBf = makeFakeBackgroundFetch() as any;
const fakeTm = makeFakeTaskManager() as any;

describe('isWifiOnly / guardWifiOnly', () => {
  it('仅 wifi 放行，其余拒绝', () => {
    expect(isWifiOnly('wifi')).toBe(true);
    expect(isWifiOnly('cellular')).toBe(false);
    expect(isWifiOnly('unknown')).toBe(false);
    expect(isWifiOnly('none')).toBe(false);
    expect(isWifiOnly('ethernet')).toBe(false);
  });

  it('guardWifiOnly：WiFi 网络返回 true', async () => {
    expect(await guardWifiOnly(() => Promise.resolve('wifi' as NetworkType))).toBe(true);
  });

  it('guardWifiOnly：蜂窝/未知返回 false', async () => {
    expect(await guardWifiOnly(() => Promise.resolve('cellular' as NetworkType))).toBe(false);
    expect(await guardWifiOnly(() => Promise.resolve('unknown' as NetworkType))).toBe(false);
  });

  it('guardWifiOnly：网络查询异常时保守返回 false', async () => {
    expect(await guardWifiOnly(() => Promise.reject(new Error('net err')))).toBe(false);
  });
});

describe('runBackgroundSyncHandler', () => {
  it('WiFi 下：开库→补齐→关库，返回 NewData', async () => {
    const closeAsync = jest.fn().mockResolvedValue(undefined);
    const openDb = jest.fn().mockResolvedValue({ closeAsync });
    const runSync = jest.fn().mockResolvedValue(undefined);
    const getNetworkType = jest.fn().mockResolvedValue('wifi' as NetworkType);

    const result = await runBackgroundSyncHandler({
      backgroundFetch: fakeBf,
      getNetworkType,
      openDb,
      runSync,
    });

    expect(result).toBe(fakeBf.BackgroundFetchResult.NewData);
    expect(getNetworkType).toHaveBeenCalledTimes(1);
    expect(openDb).toHaveBeenCalledTimes(1);
    expect(runSync).toHaveBeenCalledTimes(1);
    expect(closeAsync).toHaveBeenCalledTimes(1);
  });

  it('蜂窝网络：跳过补齐，返回 NoData，runSync 不被调用', async () => {
    const openDb = jest.fn().mockResolvedValue({ closeAsync: jest.fn() });
    const runSync = jest.fn().mockResolvedValue(undefined);
    const getNetworkType = jest.fn().mockResolvedValue('cellular' as NetworkType);

    const result = await runBackgroundSyncHandler({
      backgroundFetch: fakeBf,
      getNetworkType,
      openDb,
      runSync,
    });

    expect(result).toBe(fakeBf.BackgroundFetchResult.NoData);
    expect(runSync).not.toHaveBeenCalled();
    expect(openDb).not.toHaveBeenCalled();
  });

  it('网络查询异常：跳过补齐，返回 NoData', async () => {
    const runSync = jest.fn().mockResolvedValue(undefined);
    const getNetworkType = jest.fn().mockRejectedValue(new Error('net err'));

    const result = await runBackgroundSyncHandler({
      backgroundFetch: fakeBf,
      getNetworkType,
      openDb: jest.fn(),
      runSync,
    });

    expect(result).toBe(fakeBf.BackgroundFetchResult.NoData);
    expect(runSync).not.toHaveBeenCalled();
  });

  it('无法开库：返回 Failed，runSync 不被调用', async () => {
    const runSync = jest.fn().mockResolvedValue(undefined);
    const getNetworkType = jest.fn().mockResolvedValue('wifi' as NetworkType);

    const result = await runBackgroundSyncHandler({
      backgroundFetch: fakeBf,
      getNetworkType,
      openDb: jest.fn().mockResolvedValue(null),
      runSync,
    });

    expect(result).toBe(fakeBf.BackgroundFetchResult.Failed);
    expect(runSync).not.toHaveBeenCalled();
  });

  it('补齐抛错：返回 Failed，但库已关闭', async () => {
    const closeAsync = jest.fn().mockResolvedValue(undefined);
    const openDb = jest.fn().mockResolvedValue({ closeAsync });
    const runSync = jest.fn().mockRejectedValue(new Error('sync boom'));
    const getNetworkType = jest.fn().mockResolvedValue('wifi' as NetworkType);

    const result = await runBackgroundSyncHandler({
      backgroundFetch: fakeBf,
      getNetworkType,
      openDb,
      runSync,
    });

    expect(result).toBe(fakeBf.BackgroundFetchResult.Failed);
    expect(closeAsync).toHaveBeenCalledTimes(1);
  });
});

describe('注册 / 授权 / 幂等', () => {
  beforeEach(() => {
    state.registered = false;
    fakeBf.registerTaskAsync.mockClear();
    fakeBf.unregisterTaskAsync.mockClear();
    fakeTm.isTaskRegisteredAsync.mockClear();
  });

  it('enableBackgroundSync 在用户手势下注册任务', async () => {
    const ok = await enableBackgroundSync({ taskManager: fakeTm, backgroundFetch: fakeBf });
    expect(ok).toBe(true);
    expect(fakeBf.registerTaskAsync).toHaveBeenCalledWith(
      BACKGROUND_SYNC_TASK,
      expect.objectContaining({ minimumInterval: 60 * 60 * 24, stopOnTerminate: false, startOnBoot: true })
    );
  });

  it('注册幂等：重复调用只注册一次', async () => {
    await registerBackgroundSync({ taskManager: fakeTm, backgroundFetch: fakeBf });
    await registerBackgroundSync({ taskManager: fakeTm, backgroundFetch: fakeBf });
    expect(fakeBf.registerTaskAsync).toHaveBeenCalledTimes(1);
  });

  it('isBackgroundSyncEnabled 反映注册状态', async () => {
    expect(await isBackgroundSyncEnabled({ taskManager: fakeTm })).toBe(false);
    await registerBackgroundSync({ taskManager: fakeTm, backgroundFetch: fakeBf });
    expect(await isBackgroundSyncEnabled({ taskManager: fakeTm })).toBe(true);
  });

  it('unregisterBackgroundSync 取消注册', async () => {
    await registerBackgroundSync({ taskManager: fakeTm, backgroundFetch: fakeBf });
    await unregisterBackgroundSync({ taskManager: fakeTm, backgroundFetch: fakeBf });
    expect(fakeBf.unregisterTaskAsync).toHaveBeenCalledWith(BACKGROUND_SYNC_TASK);
    expect(await isBackgroundSyncEnabled({ taskManager: fakeTm })).toBe(false);
  });
});
