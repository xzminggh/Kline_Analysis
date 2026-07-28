// [wb修改] 类型修复：为 react-navigation 声明全局路由参数表（纯类型声明，无运行时代码）
// 解决 OverviewScreen 中 navigation.navigate('详情', { stockCode }) 的 never 报错
declare global {
  namespace ReactNavigation {
    interface RootParamList {
      概览: undefined;
      详情: { stockCode: string } | undefined;
      策略: undefined;
      说明: undefined;
    }
  }
}

export {};
