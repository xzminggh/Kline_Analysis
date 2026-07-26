import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';

export default function HelpScreen() {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <View style={styles.header}>
        <Text style={styles.appTitle}>K线策略筛选器</Text>
        <Text style={styles.version}>版本号: v1.0.0</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>软件亮点</Text>
        <Text style={styles.bullet}>• 26个策略分析（8大策略类别）</Text>
        <Text style={styles.bullet}>• 智能评分系统（1-5星评级）</Text>
        <Text style={styles.bullet}>• K线图支持双指缩放、单指拖动平移、双击重置</Text>
        <Text style={styles.bullet}>• 实时显示十字光标和数据面板</Text>
        <Text style={styles.bullet}>• 一键导出完整分析报告为CSV格式</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>26个策略分类</Text>
        <Text style={styles.subTitle}>趋势跟随</Text>
        <Text style={styles.bullet}>T01 双均线金叉/死叉 · T02 60日均线多空分界 · T03 顾比均线组穿越 · T04 三线反向反转</Text>
        <Text style={styles.subTitle}>均值回归</Text>
        <Text style={styles.bullet}>M01 布林带触轨反弹 · M02 RSI超买超卖 · M03 三重过滤 · M04 缺口回补</Text>
        <Text style={styles.subTitle}>动量突破</Text>
        <Text style={styles.bullet}>P01 MOM动量穿零轴 · P02 ROC+放量确认 · P03 倍量突破前高/前低 · P04 大阴线/大阳线反包</Text>
        <Text style={styles.subTitle}>经典形态</Text>
        <Text style={styles.bullet}>S01 双底/双顶颈线突破 · S02 三角形整理末端突破 · S03 头肩底/顶颈线突破 · S04 锤子线/流星线确认</Text>
        <Text style={styles.subTitle}>关键价位</Text>
        <Text style={styles.bullet}>K01 均线支撑/压力回踩 · K02 前高变支撑/前低变阻力 · K03 斐波那契回撤共振</Text>
        <Text style={styles.subTitle}>波动率收缩</Text>
        <Text style={styles.bullet}>V01 布林带收口突破 · V02 ATR窄幅后方向选择</Text>
        <Text style={styles.subTitle}>成交量极端</Text>
        <Text style={styles.bullet}>Q01 地量见底 · Q02 天量逃顶</Text>
        <Text style={styles.subTitle}>多周期背离</Text>
        <Text style={styles.bullet}>D01 MACD底/顶背离 · D02 RSI隐性背离 · D03 CCI极端拐点</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>概览页</Text>
        <Text style={styles.bullet}>功能：全局分析仪表盘 + 筛选结果浏览</Text>
        <Text style={styles.bullet}>• 数据库状态：显示连接状态、股票数量、K线数据量</Text>
        <Text style={styles.bullet}>• 分析概览：仪表盘展示星级分布饼图和信号统计柱状图</Text>
        <Text style={styles.bullet}>• 筛选结果：按星级分页筛选（全部/5星/4星/3星/2星/1星），支持快速滚动查看</Text>
        <Text style={styles.bullet}>• 搜索过滤：按关键词、星级、信号类型、最低分数筛选，支持多种排序</Text>
        <Text style={styles.bullet}>• 点击股票条目跳转到详情页查看分析详情</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>详情页</Text>
        <Text style={styles.bullet}>功能：单只股票深度分析</Text>
        <Text style={styles.bullet}>• 股票信息：代码、名称、数据日期时间戳</Text>
        <Text style={styles.bullet}>• 最新行情：收盘价、涨跌幅、开盘价、最高价、最低价、成交量</Text>
        <Text style={styles.bullet}>• 策略分析评分：星级评级、总分、买入/卖出信号数量及详细策略命中情况</Text>
        <Text style={styles.bullet}>• K线图：蜡烛图 + 均线(MA5/MA10/MA20) + BOLL布林带 + 成交量柱状图</Text>
        <Text style={styles.bullet}>• 历史K线表格：完整显示数据库中的所有K线数据，支持滚动查看</Text>
        <Text style={styles.bullet}>• 用户输入历史：内存缓存最近20条输入的股票代码</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>策略页</Text>
        <Text style={styles.bullet}>功能：策略配置 + 筛选结果导出</Text>
        <Text style={styles.bullet}>• 策略开关：可单独启用/禁用每个策略</Text>
        <Text style={styles.bullet}>• 策略分类：按8大类别筛选查看策略</Text>
        <Text style={styles.bullet}>• 筛选结果：显示评分最高的20只股票</Text>
        <Text style={styles.bullet}>• 导出CSV：导出完整分析报告</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>K线图手势操作</Text>
        <Text style={styles.bullet}>• 双指捏合：放大/缩小K线图，调整可见K线数量</Text>
        <Text style={styles.bullet}>• 单指拖动：左右平移查看历史数据</Text>
        <Text style={styles.bullet}>• 双击：重置K线图为默认显示范围</Text>
        <Text style={styles.bullet}>• 单击：显示十字光标和数据面板</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>数据说明</Text>
        <Text style={styles.bullet}>• 数据来源：使用本地 SQLite 数据库文件</Text>
        <Text style={styles.bullet}>• 必须包含表：stocks、kline_daily、meta</Text>
        <Text style={styles.bullet}>• 至少需要100条K线数据才能进行策略分析</Text>
        <Text style={styles.bullet}>• 分析结果在内存中缓存，重新分析会清除缓存</Text>
      </View>

      <View style={styles.warningSection}>
        <Text style={styles.warningTitle}>⚠️ 风险提示</Text>
        <Text style={styles.warningText}>
          本软件仅供股票技术分析参考，不构成任何投资建议。
        </Text>
        <Text style={styles.warningHighlight}>
          这个软件只是帮助使用者筛选过去的k线指标，不代表未来趋势，投资有风险，入市需谨慎。
        </Text>
        <Text style={styles.warningText}>
          市场有风险，投资需谨慎。投资者应根据自身风险承受能力和投资目标，结合专业投资顾问的建议，做出独立的投资决策。
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0f',
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 32,
  },
  header: {
    backgroundColor: '#16213e',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    marginBottom: 16,
  },
  appTitle: {
    color: '#00d4ff',
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  version: {
    color: '#6b7280',
    fontSize: 14,
  },
  section: {
    backgroundColor: '#16213e',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    color: '#00d4ff',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  subTitle: {
    color: '#a78bfa',
    fontSize: 14,
    fontWeight: 'bold',
    marginTop: 8,
    marginBottom: 4,
  },
  bullet: {
    color: '#ffffff',
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 4,
  },
  warningSection: {
    backgroundColor: '#3f1d1d',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#ef4444',
  },
  warningTitle: {
    color: '#ef4444',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  warningText: {
    color: '#ffffff',
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 8,
  },
  warningHighlight: {
    color: '#fbbf24',
    fontSize: 14,
    fontWeight: 'bold',
    lineHeight: 22,
    marginBottom: 8,
    fontStyle: 'italic',
  },
});
