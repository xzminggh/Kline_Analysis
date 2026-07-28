/**
 * [wb修改] BackgroundSync — 后台定时补齐（expo-background-fetch）
 *
 * 职责：
 *  - 注册一个后台定时任务，按间隔自动联网补齐最新K线
 *  - 仅 WiFi 守卫：非 WiFi（蜂窝/未知/无网）一律跳过，绝不耗流量
 *  - 首次手动授权：必须由用户手势触发 enableBackgroundSync()（iOS/Android 均要求）
 *  - 任务体内逻辑全部可注入（getNetworkType/openDb/runSync/backgroundFetch），便于单测
 *
 * 设计约束：
 *  - 只新增，不改任何已有数据处理逻辑（铁律#2/#4）
 *  - expo-network / expo-sqlite / expo-file-system 均为动态 import（仅真机运行时加载，
 *    测试全程注入假依赖，不依赖 jest 对原生模块的 mock）
 */

import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import { runFullSync } from './SyncService';

export const BACKGROUND_SYNC_TASK = 'wb-kline-sync';
const DB_NAME = 'kline.sqlite';

/** 网络类型（与 expo-network 的 NetworkStateType 对齐，独立定义便于注入与单测） */
export type NetworkType =
  | 'wifi'
  | 'cellular'
  | 'unknown'
  | 'none'
  | 'ethernet'
  | 'bluetooth'
  | 'vpn'
  | 'other';

/** 仅 WiFi 放行（蜂窝/未知/无网/蓝牙/VPN 等均拒绝） */
export function isWifiOnly(type: NetworkType): boolean {
  return type === 'wifi';
}

/**
 * WiFi 守卫：查询网络类型，仅 WiFi 返回 true。
 * 查询异常时保守返回 false（宁可跳过，不冒蜂窝流量风险）。
 */
export async function guardWifiOnly(
  getNetworkType: () => Promise<NetworkType>
): Promise<boolean> {
  try {
    const type = await getNetworkType();
    return isWifiOnly(type);
  } catch {
    return false;
  }
}

export interface BackgroundSyncDeps {
  backgroundFetch?: typeof BackgroundFetch;
  taskManager?: typeof TaskManager;
  getNetworkType?: () => Promise<NetworkType>;
  openDb?: () => Promise<unknown | null>;
  runSync?: (db: unknown) => Promise<unknown>;
}

/** 任务 handler 运行所需的最小依赖（必填，测试据此注入） */
export interface HandlerDeps {
  backgroundFetch: typeof BackgroundFetch;
  getNetworkType: () => Promise<NetworkType>;
  openDb: () => Promise<unknown | null>;
  runSync: (db: unknown) => Promise<unknown>;
}

// ---- 真机默认实现（动态 import，测试不触达） ----

async function defaultGetNetworkType(): Promise<NetworkType> {
  const Network = await import('expo-network');
  const state = await Network.getNetworkStateAsync();
  switch (state.type) {
    case Network.NetworkStateType.WIFI:
      return 'wifi';
    case Network.NetworkStateType.CELLULAR:
      return 'cellular';
    case Network.NetworkStateType.NONE:
      return 'none';
    case Network.NetworkStateType.ETHERNET:
      return 'ethernet';
    case Network.NetworkStateType.BLUETOOTH:
      return 'bluetooth';
    case Network.NetworkStateType.VPN:
      return 'vpn';
    default:
      return 'unknown';
  }
}

async function defaultOpenDb(): Promise<unknown | null> {
  try {
    const FileSystemLegacy = await import('expo-file-system/legacy');
    const SQLite = await import('expo-sqlite');
    const dir = `${FileSystemLegacy.documentDirectory}SQLite`.replace(/\/$/, '');
    return await SQLite.openDatabaseAsync(DB_NAME, {}, dir);
  } catch {
    return null;
  }
}

async function defaultRunSync(db: unknown): Promise<unknown> {
  return runFullSync(db as never);
}

/**
 * 后台任务体（核心可测逻辑）。
 * 流程：WiFi 守卫 → 开库 → 补齐 → 关库；任一步失败返回对应 Result。
 */
export async function runBackgroundSyncHandler(deps: HandlerDeps): Promise<BackgroundFetch.BackgroundFetchResult> {
  const { backgroundFetch, getNetworkType, openDb, runSync } = deps;

  const allowed = await guardWifiOnly(getNetworkType);
  if (!allowed) return backgroundFetch.BackgroundFetchResult.NoData;

  const db = await openDb();
  if (!db) return backgroundFetch.BackgroundFetchResult.Failed;

  try {
    await runSync(db);
    return backgroundFetch.BackgroundFetchResult.NewData;
  } catch {
    return backgroundFetch.BackgroundFetchResult.Failed;
  } finally {
    try {
      await (db as { closeAsync?: () => Promise<void> }).closeAsync?.();
    } catch {
      /* 关库失败忽略 */
    }
  }
}

/** 是否已注册后台任务 */
export async function isBackgroundSyncEnabled(deps: BackgroundSyncDeps = {}): Promise<boolean> {
  const tm = deps.taskManager ?? TaskManager;
  return tm.isTaskRegisteredAsync(BACKGROUND_SYNC_TASK);
}

/**
 * 检测后台任务是否在当前平台可用。
 * Expo Go 不支持 background-fetch / task-manager 原生模块，返回 false。
 */
export async function isBackgroundFetchAvailable(deps: BackgroundSyncDeps = {}): Promise<boolean> {
  const bf = deps.backgroundFetch ?? BackgroundFetch;
  // [wb修改] getStatusAsync 内部会**无条件** console.warn 一条弃用通知
  // （"use expo-background-task instead"），此警告在 Expo Go 下纯属噪音
  // （后台任务本就不执行）。调用期间临时静默，异常仍由 catch 正常返回 false。
  const origWarn = console.warn;
  console.warn = () => {};
  try {
    return await bf.getStatusAsync().then(() => true);
  } catch {
    return false;
  } finally {
    console.warn = origWarn;
  }
}

/**
 * 注册后台定时任务（幂等：已注册直接返回 true）。
 * 平台不支持时（如 Expo Go）返回 false 且不抛异常/不弹警告。
 */
export async function registerBackgroundSync(deps: BackgroundSyncDeps = {}): Promise<boolean> {
  const tm = deps.taskManager ?? TaskManager;
  const bf = deps.backgroundFetch ?? BackgroundFetch;

  // 已注册 → 幂等直接返回
  const registered = await tm.isTaskRegisteredAsync(BACKGROUND_SYNC_TASK);
  if (registered) return true;

  // 检测平台能力：Expo Go 等环境不支持原生后台任务
  const available = await isBackgroundFetchAvailable(deps);
  if (!available) return false;

  // [wb修改] 临时压制 expo-background-fetch 的两个 console.warn：
  //   1) "not available in Expo Go"（上面已拦截但防御性压制）
  //   2) "deprecated, use expo-background-task instead"（信息性弃用通知，不阻塞功能）
  const origWarn = console.warn;
  console.warn = () => {}; // no-op
  try {
    await bf.registerTaskAsync(BACKGROUND_SYNC_TASK, {
      minimumInterval: 60 * 60 * 24, // 每 24 小时至多一次
      stopOnTerminate: false,
      startOnBoot: true,
    });
    return true;
  } finally {
    console.warn = origWarn; // 恢复原始 warn
  }
}

/** 取消注册后台任务 */
export async function unregisterBackgroundSync(deps: BackgroundSyncDeps = {}): Promise<void> {
  const tm = deps.taskManager ?? TaskManager;
  const bf = deps.backgroundFetch ?? BackgroundFetch;
  const registered = await tm.isTaskRegisteredAsync(BACKGROUND_SYNC_TASK);
  if (registered) await bf.unregisterTaskAsync(BACKGROUND_SYNC_TASK);
}

/**
 * 首次手动授权入口：用户手势触发注册（iOS/Android 都要求用户主动操作才能后台调度）。
 * 内部即 registerBackgroundSync，单独命名以表达"授权"语义，UI 调用更清晰。
 */
export async function enableBackgroundSync(deps: BackgroundSyncDeps = {}): Promise<boolean> {
  return registerBackgroundSync(deps);
}

// ---- 模块加载即定义任务（真机后台调度需要任务在 bundle 内已定义） ----
// [wb修改] 压制 Expo Go / 弃用警告（defineTask 内部会调 registerTaskAsync 触发 warn）
const _origWarn = console.warn;
console.warn = () => {};
try {
  TaskManager.defineTask(BACKGROUND_SYNC_TASK, async () => {
    return runBackgroundSyncHandler({
      backgroundFetch: BackgroundFetch,
      getNetworkType: defaultGetNetworkType,
      openDb: defaultOpenDb,
      runSync: defaultRunSync,
    });
  });
} catch {
  // 重复定义（HMR/测试环境）或平台不支持时忽略
}
console.warn = _origWarn;
