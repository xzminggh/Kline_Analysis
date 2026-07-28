import { AnalysisResult } from '../services/AnalysisService';
import { StrategyResult } from '../strategies/StrategyEngine';

export interface ReportConfig {
  dbName: string;
  strategyCount: number;
  enabledStrategyIds: string[];
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

function escapeMarkdown(text: string): string {
  return text.replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function getStarText(rating: number): string {
  const filled = '★'.repeat(rating);
  const empty = '☆'.repeat(5 - rating);
  return filled + empty;
}

function getActiveSignals(result: AnalysisResult): StrategyResult[] {
  return result.analysis.strategies.filter(s => s.signal !== 'NEUTRAL');
}

function getBuySignals(result: AnalysisResult): StrategyResult[] {
  return result.analysis.strategies.filter(s => s.signal === 'BUY');
}

function getSellSignals(result: AnalysisResult): StrategyResult[] {
  return result.analysis.strategies.filter(s => s.signal === 'SELL');
}

function getTendencyLabel(score: number): string {
  if (score >= 80) return '强烈看多';
  if (score >= 60) return '偏多';
  if (score >= 40) return '中性偏多';
  if (score >= 20) return '中性偏弱';
  if (score >= 0) return '偏空';
  return '强烈看空';
}

function getKeyPositionText(result: AnalysisResult): string {
  const active = getActiveSignals(result);
  const buy = active.filter(s => s.signal === 'BUY');
  const sell = active.filter(s => s.signal === 'SELL');

  const hasT02 = buy.find(s => s.id === 'T02');
  const hasT03 = buy.find(s => s.id === 'T03');
  const hasS03 = buy.find(s => s.id === 'S03');
  const hasS01 = buy.find(s => s.id === 'S01');
  const hasD01 = buy.find(s => s.id === 'D01');
  const hasD02 = buy.find(s => s.id === 'D02');
  const hasM03 = sell.find(s => s.id === 'M03');
  const hasQ02 = sell.find(s => s.id === 'Q02');

  const parts: string[] = [];
  if (hasT02 || hasT03) parts.push('中期趋势向上');
  if (hasS03 || hasS01) parts.push('反转形态确认');
  if (hasD01 || hasD02) parts.push('背离信号出现');
  if (hasM03) parts.push('短期过热');
  if (hasQ02) parts.push('天量出货');

  if (parts.length === 0) {
    if (result.analysis.overallScore >= 60) return '趋势偏多，信号干净';
    if (result.analysis.overallScore >= 40) return '趋势中性，信号分散';
    if (result.analysis.overallScore >= 0) return '多空均衡，方向不明';
    return '空头占优，回避为主';
  }
  return parts.join(' + ');
}

function getAdvice(result: AnalysisResult): { action: string; position: string; note: string } {
  const score = result.analysis.overallScore;
  const buyCount = result.analysis.buySignals;
  const sellCount = result.analysis.sellSignals;
  const active = getActiveSignals(result);

  if (score >= 80) {
    const hasT02 = active.find(s => s.id === 'T02' && s.signal === 'BUY');
    const hasS03 = active.find(s => s.id === 'S03' && s.signal === 'BUY');
    if (hasT02 && hasS03) {
      return { action: '持有/回调买入', position: '主力仓20-30%', note: '趋势+形态双重确认，等回踩MA20加仓' };
    }
    return { action: '试探性买入', position: '试探仓10-15%', note: '信号虽多但可能已在高位，等回调再加' };
  }

  if (score >= 60) {
    return { action: '回调买入', position: '主力仓20-30%', note: '性价比最高的区间，信号明确但未过热' };
  }

  if (score >= 40) {
    if (buyCount > sellCount) {
      return { action: '轻仓试探', position: '观察仓<10%', note: '信号不明确，少动多看' };
    }
    return { action: '观望', position: '空仓', note: '多空信号混杂，方向不明' };
  }

  if (score >= 0) {
    return { action: '观望', position: '空仓', note: '偏空方向，不参与' };
  }

  const hasHeadShoulders = active.find(s => s.id === 'S03' && s.signal === 'SELL');
  const hasBreakMA60 = active.find(s => s.id === 'T02' && s.signal === 'SELL');
  if (hasHeadShoulders && hasBreakMA60) {
    return { action: '清仓', position: '0%', note: '头肩顶+跌破MA60，趋势完全破坏' };
  }
  if (sellCount >= 4) {
    return { action: '清仓或大幅减仓', position: '<5%', note: '多个卖出信号共振，风险极高' };
  }
  return { action: '减仓/规避', position: '<10%', note: '空头信号占优，不宜持仓' };
}

function analyzeThreeLayer(result: AnalysisResult): { trend: string; position: string; confirm: string; conclusion: string } {
  const active = getActiveSignals(result);
  const buySignals = active.filter(s => s.signal === 'BUY');
  const sellSignals = active.filter(s => s.signal === 'SELL');

  const trendT02 = buySignals.find(s => s.id === 'T02');
  const trendT03 = buySignals.find(s => s.id === 'T03');
  const trendT01Buy = buySignals.find(s => s.id === 'T01');
  const trendT01Sell = sellSignals.find(s => s.id === 'T01');
  const trendT02Sell = sellSignals.find(s => s.id === 'T02');

  let trend = '中性';
  if (trendT02 || trendT03) trend = '向上 ✓';
  else if (trendT01Buy) trend = '短期向上';
  else if (trendT02Sell || trendT01Sell) trend = '向下 ✗';

  const posS03 = buySignals.find(s => s.id === 'S03');
  const posS01 = buySignals.find(s => s.id === 'S01');
  const posK01 = buySignals.find(s => s.id === 'K01');
  const posS03Sell = sellSignals.find(s => s.id === 'S03');
  const posS01Sell = sellSignals.find(s => s.id === 'S01');

  let position = '中性';
  if (posS03 || posS01) position = '反转/突破 ✓';
  else if (posK01) position = '支撑位 ✓';
  else if (posS03Sell || posS01Sell) position = '见顶/破位 ✗';

  const confP04 = buySignals.find(s => s.id === 'P04');
  const confP03 = buySignals.find(s => s.id === 'P03');
  const confP01 = buySignals.find(s => s.id === 'P01');
  const confD01 = buySignals.find(s => s.id === 'D01');
  const confD02 = buySignals.find(s => s.id === 'D02');
  const confM03 = sellSignals.find(s => s.id === 'M03');

  let confirm = '中性';
  if (confP04 || confP03 || confP01) confirm = '动量确认 ✓';
  else if (confD01 || confD02) confirm = '背离确认 ✓';
  else if (confM03) confirm = '过热警示 ⚠';

  const passCount = [trend, position, confirm].filter(s => s.includes('✓')).length;
  const failCount = [trend, position, confirm].filter(s => s.includes('✗')).length;

  let conclusion = '';
  if (passCount >= 2 && failCount === 0) conclusion = '三层验证通过，信号质量高';
  else if (passCount >= 2 && failCount === 1) conclusion = '两层通过一层警示，可试探参与';
  else if (passCount === 1) conclusion = '仅一层通过，信号质量一般';
  else if (failCount >= 2) conclusion = '两层以上失败，风险大于机会';
  else conclusion = '信号混杂，建议观望';

  return { trend, position, confirm, conclusion };
}

export function generateAnalysisReport(results: AnalysisResult[], config: ReportConfig): string {
  const sorted = [...results].sort((a, b) => b.analysis.overallScore - a.analysis.overallScore);
  const date = formatDate(new Date());

  const fiveStar = sorted.filter(r => r.analysis.starRating === 5);
  const fourStar = sorted.filter(r => r.analysis.starRating === 4);
  const threeStar = sorted.filter(r => r.analysis.starRating === 3);
  const weakStar = sorted.filter(r => r.analysis.starRating <= 2 && r.analysis.overallScore >= 0);
  const negative = sorted.filter(r => r.analysis.overallScore < 0);

  let report = '';

  // 头部
  report += `# K线策略筛选器 分析报告\n\n`;
  report += `**分析日期**: ${date}\n`;
  report += `**数据源**: ${config.dbName}\n`;
  report += `**策略引擎**: v2.0.0（${config.strategyCount}个策略全启用）\n`;
  report += `**分析股票数**: ${sorted.length}只\n\n`;
  report += `> **这个软件只是帮助使用者筛选过去的k线指标，不代表未来趋势，投资有风险，入市需谨慎。**\n\n`;
  report += `---\n\n`;

  // 一、核心结论（最前面）
  report += `## 一、核心结论\n\n`;

  if (fiveStar.length > 0) {
    report += `**重点关注（5星）**: ${fiveStar.map(r => `${r.stock.code} ${r.stock.name}`).join('、')}\n\n`;
  }
  if (fourStar.length > 0) {
    report += `**次重点关注（4星）**: ${fourStar.map(r => `${r.stock.code} ${r.stock.name}`).join('、')}\n\n`;
  }
  if (negative.length > 0) {
    report += `**强烈回避（负分）**: ${negative.map(r => `${r.stock.code} ${r.stock.name}`).join('、')}\n\n`;
  }

  // 二、汇总表
  report += `## 二、全量分析汇总表\n\n`;
  report += `| 排名 | 代码 | 名称 | 得分 | 星级 | 买入 | 卖出 | 最新价 | 趋势判断 |\n`;
  report += `|------|------|------|------|------|------|------|--------|---------|\n`;
  sorted.forEach((r, i) => {
    const latest = r.latestKline;
    const price = latest ? latest.close.toFixed(2) : '-';
    report += `| ${i + 1} | ${r.stock.code} | ${r.stock.name} | ${r.analysis.overallScore} | ${getStarText(r.analysis.starRating)} | ${r.analysis.buySignals} | ${r.analysis.sellSignals} | ${price} | ${getTendencyLabel(r.analysis.overallScore)} |\n`;
  });
  report += `\n`;

  // 三、关键股票详细分析
  const keyStocks = [...fiveStar, ...fourStar, ...threeStar];
  if (keyStocks.length > 0) {
    report += `## 三、关键股票详细分析\n\n`;
    report += `以下股票按星级从高到低排列，重点分析其技术状态、三层验证和操作建议。\n\n`;

    for (const r of keyStocks) {
      const latest = r.latestKline;
      const active = getActiveSignals(r);
      const advice = getAdvice(r);
      const threeLayer = analyzeThreeLayer(r);

      report += `### ${r.stock.code} ${r.stock.name} — ${r.analysis.overallScore}分 ${getStarText(r.analysis.starRating)}\n\n`;

      if (latest) {
        const change = ((latest.close - latest.open) / latest.open * 100).toFixed(2);
        const changeNum = parseFloat(change);
        report += `最新价 **${latest.close.toFixed(2)}元**（${changeNum >= 0 ? '+' : ''}${change}%），成交量 ${latest.volume.toFixed(2)}万手。`;
      }
      report += `综合得分 ${r.analysis.overallScore} 分，买入信号 ${r.analysis.buySignals} 个，卖出信号 ${r.analysis.sellSignals} 个。`;
      report += `状态判断：${getKeyPositionText(r)}。\n\n`;

      if (active.length > 0) {
        report += `命中策略：\n\n`;
        report += `| 策略 | 信号 | 分值 | 详情 |\n`;
        report += `|------|------|------|------|\n`;
        for (const s of active) {
          const sigText = s.signal === 'BUY' ? '买入' : '卖出';
          report += `| ${s.id} ${s.name} | ${sigText} | ${s.score > 0 ? '+' : ''}${s.score} | ${escapeMarkdown(s.details)} |\n`;
        }
        report += `\n`;
      }

      report += `三层验证：\n\n`;
      report += `- 趋势层（MA60/顾比均线）：${threeLayer.trend}\n`;
      report += `- 形态层（头肩底/双底/支撑）：${threeLayer.position}\n`;
      report += `- 动量层（MOM/ROC/背离）：${threeLayer.confirm}\n`;
      report += `- **结论：${threeLayer.conclusion}**\n\n`;

      report += `操作建议：**${advice.action}**，仓位建议 **${advice.position}**。${advice.note}\n\n`;
      report += `---\n\n`;
    }
  }

  // 四、一般股票简要分析（2星及以下但非负分）
  if (weakStar.length > 0) {
    report += `## 四、一般股票简评\n\n`;
    report += `以下股票得分较低或方向不明，建议观望。\n\n`;
    for (const r of weakStar) {
      const advice = getAdvice(r);
      report += `- **${r.stock.code} ${r.stock.name}**（${r.analysis.overallScore}分）：${getKeyPositionText(r)}。建议：${advice.action}，${advice.position}。\n`;
    }
    report += `\n`;
  }

  // 五、负分股票：必须回避
  if (negative.length > 0) {
    report += `## 五、强烈回避股票\n\n`;
    report += `以下股票综合评分低于0，空头信号占主导，风险收益比不利。\n\n`;
    for (const r of negative) {
      const topSells = getSellSignals(r).slice(0, 3).map(s => `${s.name}(${s.score}分)`).join('、');
      report += `- **${r.stock.code} ${r.stock.name}**（${r.analysis.overallScore}分）：${topSells}。建议：${getAdvice(r).action}。\n`;
    }
    report += `\n`;
  }

  // 六、买卖点汇总
  report += `## 六、买卖点汇总\n\n`;

  const canBuy = sorted.filter(r => r.analysis.overallScore >= 40 && r.analysis.buySignals > r.analysis.sellSignals);
  if (canBuy.length > 0) {
    report += `### 可买入/持有\n\n`;
    report += `| 优先级 | 股票 | 操作 | 仓位 | 核心依据 |\n`;
    report += `|--------|------|------|------|---------|\n`;
    canBuy.forEach((r, i) => {
      const advice = getAdvice(r);
      const keySignals = getBuySignals(r).slice(0, 2).map(s => s.name).join('+');
      report += `| ${i + 1} | ${r.stock.code} ${r.stock.name} | ${advice.action} | ${advice.position} | ${keySignals} |\n`;
    });
    report += `\n`;
  }

  const shouldReduce = sorted.filter(r => {
    const hasM03 = r.analysis.strategies.find(s => s.id === 'M03' && s.signal === 'SELL');
    const hasQ02 = r.analysis.strategies.find(s => s.id === 'Q02' && s.signal === 'SELL');
    return r.analysis.overallScore >= 40 && (hasM03 || hasQ02);
  });
  if (shouldReduce.length > 0) {
    report += `### 需减仓/止盈\n\n`;
    report += `| 股票 | 原因 | 操作 |\n`;
    report += `|------|------|------|\n`;
    for (const r of shouldReduce) {
      const reasons = getSellSignals(r).map(s => s.name).join('、');
      report += `| ${r.stock.code} ${r.stock.name} | ${reasons} | 逢高减仓1/3 |\n`;
    }
    report += `\n`;
  }

  if (negative.length > 0) {
    report += `### 应清仓/规避\n\n`;
    report += `| 股票 | 核心卖出信号 | 操作 |\n`;
    report += `|------|-------------|------|\n`;
    for (const r of negative) {
      const topSells = getSellSignals(r).slice(0, 3).map(s => `${s.name}(${s.score}分)`).join('、');
      report += `| ${r.stock.code} ${r.stock.name} | ${topSells} | 清仓 |\n`;
    }
    report += `\n`;
  }

  // 七、风险提示
  report += `## 七、重要提示\n\n`;
  report += `> **这个软件只是帮助使用者筛选过去的k线指标，不代表未来趋势，投资有风险，入市需谨慎。**\n\n`;
  report += `1. 本报告基于历史K线数据回溯分析，不构成任何投资建议。\n`;
  report += `2. 软件仅分析技术面，不分析公司基本面、行业前景、政策面等因素。\n`;
  report += `3. 技术指标天然具有滞后性，趋势走出来了指标才会跟上。\n`;
  report += `4. 五星股票不代表"一定会涨"，可能是已经涨了很多之后各种指标都过热了。\n`;
  report += `5. 负分股票不代表"一定会跌"，但空头信号占优时，风险收益比不利。\n`;
  report += `6. 买卖决策请结合基本面、资金面、政策面综合判断。\n\n`;
  report += `---\n\n`;
  report += `*报告生成时间：${date}* · *K线策略筛选器 正式联网版 v2.0.0* · *策略数量：${config.strategyCount}个*\n`;

  return report;
}
