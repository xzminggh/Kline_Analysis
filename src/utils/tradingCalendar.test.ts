import {
  isTradingDay,
  getLastTradingDay,
  getMissingTradingDays,
  getTodayString,
  updateHolidays,
  getHolidaysConfig,
  DateString,
} from './tradingCalendar';

describe('tradingCalendar', () => {
  // 每个测试前恢复默认节假日表
  beforeEach(() => {
    updateHolidays([], []); // 清空后下面测试会注入自定义数据，避免依赖默认2026年预估数据
  });

  describe('isTradingDay', () => {
    it('普通周一到周五应为交易日', () => {
      updateHolidays([], []);
      expect(isTradingDay('2026-01-05')).toBe(true); // 周一
      expect(isTradingDay('2026-01-06')).toBe(true); // 周二
      expect(isTradingDay('2026-01-07')).toBe(true); // 周三
      expect(isTradingDay('2026-01-08')).toBe(true); // 周四
      expect(isTradingDay('2026-01-09')).toBe(true); // 周五
    });

    it('普通周六日应为非交易日', () => {
      updateHolidays([], []);
      expect(isTradingDay('2026-01-03')).toBe(false); // 周六
      expect(isTradingDay('2026-01-04')).toBe(false); // 周日
    });

    it('节假日应为非交易日', () => {
      updateHolidays(['2026-01-01', '2026-01-02'], []);
      expect(isTradingDay('2026-01-01')).toBe(false); // 元旦
      expect(isTradingDay('2026-01-02')).toBe(false);
      expect(isTradingDay('2026-01-05')).toBe(true);  // 节后第一个工作日
    });

    it('调休上班日应为交易日（覆盖周末规则）', () => {
      updateHolidays(['2026-02-16'], ['2026-02-14']);
      // 2/14 是周六，但因调休上班 → 交易
      expect(isTradingDay('2026-02-14')).toBe(true);
      // 2/15 是周日，无调休 → 非交易
      expect(isTradingDay('2026-02-15')).toBe(false);
      // 2/16 是春节 → 非交易
      expect(isTradingDay('2026-02-16')).toBe(false);
    });

    it('支持 Date 对象输入', () => {
      updateHolidays(['2026-01-01'], []);
      expect(isTradingDay(new Date(2026, 0, 1, 12, 0, 0))).toBe(false); // 元旦
      expect(isTradingDay(new Date(2026, 0, 5, 12, 0, 0))).toBe(true);  // 周一
    });

    it('调休上班日优先级高于节假日', () => {
      // 极端情况：同一天既在 holidays 又在 workdays
      updateHolidays(['2026-02-14'], ['2026-02-14']);
      expect(isTradingDay('2026-02-14')).toBe(true); // workdays 优先级更高
    });
  });

  describe('getLastTradingDay', () => {
    it('普通周二应回退到周一', () => {
      updateHolidays([], []);
      const last = getLastTradingDay('2026-01-06'); // 周二
      expect(last.getFullYear()).toBe(2026);
      expect(last.getMonth()).toBe(0); // Jan
      expect(last.getDate()).toBe(5);  // 周一
    });

    it('跨周末应回退到上周五', () => {
      updateHolidays([], []);
      const last = getLastTradingDay('2026-01-05'); // 周一
      expect(last.getDate()).toBe(2); // 上周五 (1/2)
    });

    it('跨节假日应回退到节前最后一个交易日', () => {
      // 春节：2/16(除夕,周一)-2/23(初七,周一) 休市
      updateHolidays(
        ['2026-02-16', '2026-02-17', '2026-02-18', '2026-02-19',
         '2026-02-20', '2026-02-21', '2026-02-22', '2026-02-23'],
        ['2026-02-14', '2026-02-15']
      );
      // 2/24(周二) 节后第一天，前一个交易日应为 2/15(周日，调休上班)
      // 因为 2/14-2/15 调休上班，2/16-2/23 春节休市
      const last = getLastTradingDay('2026-02-24');
      expect(last.getDate()).toBe(15); // 2/15 周日(调休上班)
    });

    it('调休上班日也应被识别为交易日', () => {
      updateHolidays(['2026-05-01'], ['2026-04-26']);
      // 4/27(周一) 前一个交易日应为 4/26(周日，调休上班)
      const last = getLastTradingDay('2026-04-27');
      expect(last.getDate()).toBe(26);
    });
  });

  describe('getMissingTradingDays', () => {
    it('返回两个日期之间所有交易日', () => {
      updateHolidays([], []);
      // 2026-01-05(周一) 到 2026-01-09(周五) 之间无缺失
      const missing = getMissingTradingDays('2026-01-05', '2026-01-09');
      expect(missing).toEqual([
        '2026-01-06', '2026-01-07', '2026-01-08',
      ]);
    });

    it('自动排除周末', () => {
      updateHolidays([], []);
      // 2026-01-02(周五) 到 2026-01-05(周一) 之间：只遍历 1/3 周六、1/4 周日，都应被排除
      const missing = getMissingTradingDays('2026-01-02', '2026-01-05');
      expect(missing).toEqual([]); // 中间无交易日（全是周末）
    });

    it('自动排除节假日', () => {
      updateHolidays(['2026-01-01', '2026-01-02'], []);
      // 2025-12-31(周三) 到 2026-01-05(周一) 之间：1/1-1/2 元旦被排除
      const missing = getMissingTradingDays('2025-12-31', '2026-01-05');
      expect(missing).toEqual([]); // 中间无交易日（元旦被排除了）
    });

    it('包含调休上班日', () => {
      updateHolidays(['2026-02-16'], ['2026-02-14']);
      // 2/13(周五) 到 2/17(周二) 之间：2/14 调休上班应被包含，2/15 周日排除，2/16 春节排除
      const missing = getMissingTradingDays('2026-02-13', '2026-02-17');
      expect(missing).toEqual(['2026-02-14']);
    });

    it('连续多交易日全部返回', () => {
      updateHolidays([], []);
      // 2026-01-05(周一) 到 2026-01-12(周一) 之间
      const missing = getMissingTradingDays('2026-01-05', '2026-01-12');
      expect(missing).toEqual([
        '2026-01-06', '2026-01-07', '2026-01-08', '2026-01-09',
      ]); // 1/10-1/11 周末排除
    });
  });

  describe('getTodayString', () => {
    it('返回 YYYY-MM-DD 格式', () => {
      const today = getTodayString();
      expect(/^\d{4}-\d{2}-\d{2}$/.test(today)).toBe(true);
    });
  });

  describe('updateHolidays / getHolidaysConfig', () => {
    it('updateHolidays 后配置应立即生效', () => {
      updateHolidays(['2026-03-01'], []);
      expect(isTradingDay('2026-03-01')).toBe(false);
      expect(isTradingDay('2026-03-02')).toBe(true);
    });

    it('getHolidaysConfig 返回当前配置副本', () => {
      updateHolidays(['2026-03-01', '2026-03-02'], ['2026-03-07']);
      const config = getHolidaysConfig();
      expect(config.holidays).toContain('2026-03-01');
      expect(config.holidays).toContain('2026-03-02');
      expect(config.workdays).toContain('2026-03-07');
      // 修改返回副本不应影响内部状态
      config.holidays.push('2026-03-03');
      expect(isTradingDay('2026-03-03')).toBe(true);
    });
  });

  describe('边界与鲁棒性', () => {
    it('相同 start 和 end 应返回空数组', () => {
      updateHolidays([], []);
      const missing = getMissingTradingDays('2026-01-05', '2026-01-05');
      expect(missing).toEqual([]);
    });

    it('startDate 晚于 endDate 应返回空数组', () => {
      updateHolidays([], []);
      const missing = getMissingTradingDays('2026-01-10', '2026-01-05');
      expect(missing).toEqual([]);
    });
  });
});
