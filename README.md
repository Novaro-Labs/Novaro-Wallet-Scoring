# Novaro-Wallet-Scoring
Use Chainlink to score users based on their holdings and transaction information in the past month

## external-adapter 获取用户代币数据和交易信息的外部适配器

## wallet-scoring 钱包评分合约

## 数据流向

1. External Adapter (index.js) 获取数据
2. 通过 Chainlink Job 处理数据
3. 数据传递到智能合约的 fulfill 函数
4. 合约更新钱包评分

## 更新数据

1. Chainlink Automation 每24小时检查一次 checkUpkeep 函数
2. 如果有更新，调用 performUpkeep 函数
3. 更新mapping中的用户的评分数据