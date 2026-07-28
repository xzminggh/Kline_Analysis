/**
 * [wb修改] 最小 ESLint 配置
 *
 * 背景：仓库 package.json 早已声明 "lint": "eslint . --ext .ts,.tsx"
 *       并依赖 eslint@8 + @typescript-eslint/*，但根目录长期缺配置文件（历史缺口）。
 *       本文件补齐该配置，使 lint 脚本可真正运行。
 *
 * 设计原则：
 *  - 用 @typescript-eslint/parser 解析 .ts/.tsx（eslint 8  legacy 配置格式）
 *  - 启用 eslint:recommended + @typescript-eslint/recommended 做基础质量门
 *  - 对历史代码可能误报/噪声的规则降级为 warn（不阻断 CI exit 0）
 *  - 类型层面的错误交给 tsc，eslint 不重复拦（no-undef 关闭）
 *  - 纯新增文件，不改任何已有代码
 */

module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2021,
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
  },
  env: {
    es2021: true,
    node: true,
    browser: true,
  },
  plugins: ['@typescript-eslint'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  rules: {
    // 类型正确性交给 tsc，eslint 不重复拦截
    'no-undef': 'off',
    'no-unused-vars': 'off',
    // 历史代码存在单处 prefer-const 误报，降级为 warn 以不阻断仓库 lint（不改源码，守铁律#2/#3）
    'prefer-const': 'warn',
    // 历史代码常见写法，降级为 warn 避免阻断，WB 代码应保持零 warn
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-non-null-assertion': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/no-empty-function': 'warn',
    '@typescript-eslint/no-empty-interface': 'warn',
    '@typescript-eslint/ban-ts-comment': 'warn',
    '@typescript-eslint/no-unused-vars': [
      'warn',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
    ],
  },
  ignorePatterns: [
    'node_modules/',
    'babel.config.js',
    'metro.config.js',
    'jest.config.js',
    'scripts/',
    'dist/',
    'build/',
    '*.config.js',
  ],
};
