/**
 * A 股交易日历工具
 *
 * ⚠️ 节假日数据为 2026 年预估，使用前请根据国务院正式通知更新。
 * 可通过 updateHolidays() 注入自定义节假日表，无需修改源码。
 */

/** 日期格式 YYYY-MM-DD */
export type DateString = string;

/** 交易日历配置 */
interface CalendarConfig {
  holidays: Set<DateString>;      // 休市日
  workdays: Set<DateString>;      // 调休上班日（周末补班）
}

/**
 * 2026 年 A 股节假日（预估）
 * 来源：基于国务院历年安排规律推算
 * 更新提示：每年 11-12 月国务院发布下一年节假日安排后，请调用 updateHolidays() 刷新
 */
const DEFAULT_HOLIDAYS_2026: DateString[] = [
  // 元旦 2026/1/1-1/2（周四-周五）
  '2026-01-01', '2026-01-02',

  // 春节 2026/2/16-2/23（除夕-初七，周一-周一）
  '2026-02-16', '2026-02-17', '2026-02-18', '2026-02-19',
  '2026-02-20', '2026-02-21', '2026-02-22', '2026-02-23',

  // 清明节 2026/4/4-4/6（周六-周一）
  '2026-04-04', '2026-04-05', '2026-04-06',

  // 劳动节 2026/5/1-5/5（周五-周二）
  '2026-05-01', '2026-05-02', '2026-05-03', '2026-05-04', '2026-05-05',

  // 端午节 2026/6/19-6/21（周五-周日）
  '2026-06-19', '2026-06-20', '2026-06-21',

  // 中秋节+国庆节 2026/10/1-10/8（周四-周四）
  '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04',
  '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08',
];

/** 2026 年调休上班日（周末补班，预估） */
const DEFAULT_WORKDAYS_2026: DateString[] = [
  // 春节调休
  '2026-02-14', '2026-02-15',
  // 劳动节调休
  '2026-04-26', '2026-05-09',
  // 中秋国庆调休
  '2026-09-27', '2026-10-10',
];

// 内部状态（可更新）
let config: CalendarConfig = {
  holidays: new Set(DEFAULT_HOLIDAYS_2026),
  workdays: new Set(DEFAULT_WORKDAYS_2026),
};

/**
 * 将 Date 或字符串转为 YYYY-MM-DD
 */
function toDateString(date: Date | DateString): DateString {
  if (typeof date === 'string') {
    // 已经是 YYYY-MM-DD 格式
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
    date = new Date(date);
  }
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * 将 YYYY-MM-DD 转为 Date 对象（使用本地时区中午 12 点避免 UTC 偏差）
 */
function toDateObj(dateStr: DateString): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0);
}

/**
 * 判断某日是否为 A 股交易日
 *
 * 规则：
 * 1. 周一到周五为潜在交易日
 * 2. 节假日休市（holidays）→ 非交易
 * 3. 调休上班日（workdays）→ 交易（覆盖周末规则）
 */
export function isTradingDay(date: Date | DateString): boolean {
  const ds = toDateString(date);

  // 调休上班日 → 交易（优先级最高）
  if (config.workdays.has(ds)) return true;

  // 节假日 → 非交易
  if (config.holidays.has(ds)) return false;

  const dt = toDateObj(ds);
  const day = dt.getDay(); // 0=周日, 1=周一, ..., 6=周六

  // 周六日 → 非交易
  return day !== 0 && day !== 6;
}

/**
 * 获取指定日期（不含）前一个交易日
 * @param date 基准日期
 * @returns 前一个交易日的 Date 对象
 */
export function getLastTradingDay(date: Date | DateString): Date {
  let dt = toDateObj(toDateString(date));

  do {
    dt = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate() - 1, 12, 0, 0);
  } while (!isTradingDay(toDateString(dt)));

  return dt;
}

/**
 * 获取两个日期之间所有缺失的交易日（左闭右开）
 * @param startDate 起始日期（含）
 * @param endDate 结束日期（不含），通常为今日
 * @returns YYYY-MM-DD 数组，按升序排列
 */
export function getMissingTradingDays(
  startDate: DateString,
  endDate: DateString
): DateString[] {
  const result: DateString[] = [];

  let current = toDateObj(startDate);
  const end = toDateObj(endDate);

  // 从 startDate 的次日开始，到 endDate 的前一日
  current = new Date(current.getFullYear(), current.getMonth(), current.getDate() + 1, 12, 0, 0);

  while (current < end) {
    const ds = toDateString(current);
    if (isTradingDay(ds)) {
      result.push(ds);
    }
    current = new Date(current.getFullYear(), current.getMonth(), current.getDate() + 1, 12, 0, 0);
  }

  return result;
}

/**
 * 获取今日日期字符串 YYYY-MM-DD
 */
export function getTodayString(): DateString {
  return toDateString(new Date());
}

/**
 * 更新节假日表（支持外部注入自定义数据）
 * @param holidays 休市日数组
 * @param workdays 调休上班日数组
 */
export function updateHolidays(
  holidays: DateString[],
  workdays: DateString[]
): void {
  config = {
    holidays: new Set(holidays),
    workdays: new Set(workdays),
  };
}

/**
 * 获取当前节假日配置（只读副本）
 */
export function getHolidaysConfig(): { holidays: DateString[]; workdays: DateString[] } {
  return {
    holidays: Array.from(config.holidays),
    workdays: Array.from(config.workdays),
  };
}
