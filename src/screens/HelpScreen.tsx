import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';

export default function HelpScreen() {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <View style={styles.header}>
        <Text style={styles.appTitle}>K线策略筛选器</Text>
        <Text style={styles.version}>版本号: v1.0.0</Text>
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

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>软件亮点</Text>
        <Text style={styles.bullet}>• 26个策略分析（8大策略类别）</Text>
        <Text style={styles.bullet}>• 智能评分系统（1-5星评级）</Text>
        <Text style={styles.bullet}>• K线图支持单指拖动平移、双击重置</Text>
        <Text style={styles.bullet}>• 实时显示十字光标和数据面板</Text>
        <Text style={styles.bullet}>• 一键生成 Markdown 分析报告（Top20 / 全量）</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>指标速查表</Text>
        
        <View style={styles.indicatorTable}>
          <View style={styles.tableHeader}>
            <Text style={styles.tableHeaderId}>ID</Text>
            <Text style={styles.tableHeaderName}>指标名称</Text>
            <Text style={styles.tableHeaderDesc}>说明</Text>
          </View>
          
          <Text style={styles.tableCategory}>趋势跟随</Text>
          <View style={styles.tableRow}>
            <Text style={styles.tableCellId}>T01</Text>
            <Text style={styles.tableCellName}>双均线金叉/死叉</Text>
            <Text style={styles.tableCellDesc}>MA5上穿MA10为金叉(买入)，下穿为死叉(卖出)</Text>
          </View>
          <View style={styles.tableRow}>
            <Text style={styles.tableCellId}>T02</Text>
            <Text style={styles.tableCellName}>60日均线多空分界</Text>
            <Text style={styles.tableCellDesc}>收盘价站在60日均线上方为多头，下方为空头</Text>
          </View>
          <View style={styles.tableRow}>
            <Text style={styles.tableCellId}>T03</Text>
            <Text style={styles.tableCellName}>顾比均线组穿越</Text>
            <Text style={styles.tableCellDesc}>短期均线组穿越长期均线组判断趋势变化</Text>
          </View>
          <View style={styles.tableRow}>
            <Text style={styles.tableCellId}>T04</Text>
            <Text style={styles.tableCellName}>三线反向反转</Text>
            <Text style={styles.tableCellDesc}>MA5/MA10/MA20三线发散后反向交叉确认反转</Text>
          </View>
          
          <Text style={styles.tableCategory}>均值回归</Text>
          <View style={styles.tableRow}>
            <Text style={styles.tableCellId}>M01</Text>
            <Text style={styles.tableCellName}>布林带触轨反弹</Text>
            <Text style={styles.tableCellDesc}>价格触及布林带上轨为超买(卖出)，下轨为超卖(买入)</Text>
          </View>
          <View style={styles.tableRow}>
            <Text style={styles.tableCellId}>M02</Text>
            <Text style={styles.tableCellName}>RSI超买超卖</Text>
            <Text style={styles.tableCellDesc}>RSI{'>'}70为超买(卖出)，RSI{'<'}30为超卖(买入)</Text>
          </View>
          <View style={styles.tableRow}>
            <Text style={styles.tableCellId}>M03</Text>
            <Text style={styles.tableCellName}>三重过滤</Text>
            <Text style={styles.tableCellDesc}>结合RSI、MACD、KDJ三重指标确认买卖信号</Text>
          </View>
          <View style={styles.tableRow}>
            <Text style={styles.tableCellId}>M04</Text>
            <Text style={styles.tableCellName}>缺口回补</Text>
            <Text style={styles.tableCellDesc}>向上跳空缺口后回补为卖出信号，向下跳空缺口回补为买入信号</Text>
          </View>
          
          <Text style={styles.tableCategory}>动量突破</Text>
          <View style={styles.tableRow}>
            <Text style={styles.tableCellId}>P01</Text>
            <Text style={styles.tableCellName}>MOM动量穿零轴</Text>
            <Text style={styles.tableCellDesc}>动量指标从下方穿越零轴为买入，从上方穿越为卖出</Text>
          </View>
          <View style={styles.tableRow}>
            <Text style={styles.tableCellId}>P02</Text>
            <Text style={styles.tableCellName}>ROC+放量确认</Text>
            <Text style={styles.tableCellDesc}>价格变化率(ROC)突破+成交量放大确认趋势</Text>
          </View>
          <View style={styles.tableRow}>
            <Text style={styles.tableCellId}>P03</Text>
            <Text style={styles.tableCellName}>倍量突破前高/前低</Text>
            <Text style={styles.tableCellDesc}>成交量翻倍突破前期高点(买入)或低点(卖出)</Text>
          </View>
          <View style={styles.tableRow}>
            <Text style={styles.tableCellId}>P04</Text>
            <Text style={styles.tableCellName}>大阴线/大阳线反包</Text>
            <Text style={styles.tableCellDesc}>大阳线反包前一根K线为买入，大阴线反包为卖出</Text>
          </View>
          
          <Text style={styles.tableCategory}>经典形态</Text>
          <View style={styles.tableRow}>
            <Text style={styles.tableCellId}>S01</Text>
            <Text style={styles.tableCellName}>双底/双顶颈线突破</Text>
            <Text style={styles.tableCellDesc}>W底颈线突破为买入，M顶颈线突破为卖出</Text>
          </View>
          <View style={styles.tableRow}>
            <Text style={styles.tableCellId}>S02</Text>
            <Text style={styles.tableCellName}>三角形整理末端突破</Text>
            <Text style={styles.tableCellDesc}>收敛三角形末端向上突破买入，向下突破卖出</Text>
          </View>
          <View style={styles.tableRow}>
            <Text style={styles.tableCellId}>S03</Text>
            <Text style={styles.tableCellName}>头肩底/顶颈线突破</Text>
            <Text style={styles.tableCellDesc}>头肩底颈线突破买入，头肩顶颈线突破卖出</Text>
          </View>
          <View style={styles.tableRow}>
            <Text style={styles.tableCellId}>S04</Text>
            <Text style={styles.tableCellName}>锤子线/流星线确认</Text>
            <Text style={styles.tableCellDesc}>锤子线(长下影)为买入信号，流星线(长上影)为卖出信号</Text>
          </View>
          
          <Text style={styles.tableCategory}>关键价位</Text>
          <View style={styles.tableRow}>
            <Text style={styles.tableCellId}>K01</Text>
            <Text style={styles.tableCellName}>均线支撑/压力回踩</Text>
            <Text style={styles.tableCellDesc}>股价回踩均线支撑不破买入，反弹至压力位受阻卖出</Text>
          </View>
          <View style={styles.tableRow}>
            <Text style={styles.tableCellId}>K02</Text>
            <Text style={styles.tableCellName}>前高变支撑/前低变阻力</Text>
            <Text style={styles.tableCellDesc}>前期高点被突破后变为支撑，前期低点被突破后变为阻力</Text>
          </View>
          <View style={styles.tableRow}>
            <Text style={styles.tableCellId}>K03</Text>
            <Text style={styles.tableCellName}>斐波那契回撤共振</Text>
            <Text style={styles.tableCellDesc}>价格回调至斐波那契关键位(0.382/0.5/0.618)获得支撑买入</Text>
          </View>
          
          <Text style={styles.tableCategory}>波动率收缩</Text>
          <View style={styles.tableRow}>
            <Text style={styles.tableCellId}>V01</Text>
            <Text style={styles.tableCellName}>布林带收口突破</Text>
            <Text style={styles.tableCellDesc}>布林带收口后放量突破上轨买入，跌破下轨卖出</Text>
          </View>
          <View style={styles.tableRow}>
            <Text style={styles.tableCellId}>V02</Text>
            <Text style={styles.tableCellName}>ATR窄幅后方向选择</Text>
            <Text style={styles.tableCellDesc}>ATR指标收缩后放大，确认方向突破</Text>
          </View>
          
          <Text style={styles.tableCategory}>成交量极端</Text>
          <View style={styles.tableRow}>
            <Text style={styles.tableCellId}>Q01</Text>
            <Text style={styles.tableCellName}>地量见底</Text>
            <Text style={styles.tableCellDesc}>成交量极度萎缩后放量上涨，确认底部</Text>
          </View>
          <View style={styles.tableRow}>
            <Text style={styles.tableCellId}>Q02</Text>
            <Text style={styles.tableCellName}>天量逃顶</Text>
            <Text style={styles.tableCellDesc}>成交量创天量后价格滞涨，提示风险</Text>
          </View>
          
          <Text style={styles.tableCategory}>多周期背离</Text>
          <View style={styles.tableRow}>
            <Text style={styles.tableCellId}>D01</Text>
            <Text style={styles.tableCellName}>MACD底/顶背离</Text>
            <Text style={styles.tableCellDesc}>价格创新低MACD未创新低为底背离(买入)，价格创新高MACD未创新高为顶背离(卖出)</Text>
          </View>
          <View style={styles.tableRow}>
            <Text style={styles.tableCellId}>D02</Text>
            <Text style={styles.tableCellName}>RSI隐性背离</Text>
            <Text style={styles.tableCellDesc}>RSI指标与价格走势出现隐性背离信号</Text>
          </View>
          <View style={styles.tableRow}>
            <Text style={styles.tableCellId}>D03</Text>
            <Text style={styles.tableCellName}>CCI极端拐点</Text>
            <Text style={styles.tableCellDesc}>CCI{'>'}100进入超买区域，CCI{'<'}100进入超卖区域</Text>
          </View>
        </View>
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
        <Text style={styles.bullet}>功能：策略配置 + 筛选结果 + 报告导出</Text>
        <Text style={styles.bullet}>• 策略开关：可单独启用/禁用每个策略</Text>
        <Text style={styles.bullet}>• 策略分类：按8大类别筛选查看策略</Text>
        <Text style={styles.bullet}>• 筛选结果：显示评分最高的20只股票</Text>
        <Text style={styles.bullet}>• 报告导出：支持生成 Top20 或全量 Markdown 报告</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>K线图手势操作</Text>
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
  indicatorTable: {
    backgroundColor: '#0f3460',
    borderRadius: 8,
    overflow: 'hidden',
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#1a1a2e',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderBottomWidth: 2,
    borderBottomColor: '#00d4ff',
  },
  tableHeaderId: {
    color: '#00d4ff',
    fontSize: 11,
    fontWeight: 'bold',
    width: 40,
  },
  tableHeaderName: {
    color: '#00d4ff',
    fontSize: 11,
    fontWeight: 'bold',
    flex: 2,
  },
  tableHeaderDesc: {
    color: '#00d4ff',
    fontSize: 11,
    fontWeight: 'bold',
    flex: 4,
  },
  tableCategory: {
    color: '#a78bfa',
    fontSize: 12,
    fontWeight: 'bold',
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#16213e',
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a2e',
  },
  tableCellId: {
    color: '#00d4ff',
    fontSize: 11,
    fontWeight: 'bold',
    width: 40,
  },
  tableCellName: {
    color: '#ffffff',
    fontSize: 11,
    flex: 2,
    marginRight: 8,
  },
  tableCellDesc: {
    color: '#94a3b8',
    fontSize: 10,
    flex: 4,
  },
});
