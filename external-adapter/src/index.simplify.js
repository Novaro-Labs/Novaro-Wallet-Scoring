const { Requester, Validator } = require('@chainlink/external-adapter')
const axios = require('axios')
require('dotenv').config();

// 定义必需的环境变量
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY
console.log(ETHERSCAN_API_KEY)

if(!ETHERSCAN_API_KEY) {
    throw new Error('ETHERSCAN_API_KEY is not set')
}

// 定义输入参数
const customParams = {
    walletAddress: ['walletAddress']
}

// 创建验证器
const validate = (input) => {
    const validator = new Validator(input, customParams)
    if (validator.error) throw validator.error
    return validator.validated.data
}

// 主要的处理函数
// 主要的处理函数
const createRequest = async (input, callback) => {
    const { walletAddress } = validate(input)
  
    try {
      // 1. 获取 ETH 余额
      const ethBalance = await getEthBalance(walletAddress)
  
      // 2. 获取 ERC20 代币余额
      const erc20Balances = await getERC20Balances(walletAddress)
  
      // 3. 获取近一个月的交易记录
      const recentTransactions = await getRecentTransactions(walletAddress)
  
      // 组合结果
      const result = {
        ethBalance,
        erc20Balances,
        recentTransactions
      }
  
      callback(200, {
        data: { result },
        result,
        statusCode: 200
      })
    } catch (error) {
      callback(500, {
        status: 'errored',
        error: error.message,
        statusCode: 500
      })
    }
  }
  

// 获取 ETH 余额的函数
const getEthBalance = async (address) => {
    const url = `https://api.etherscan.io/api?module=account&action=balance&address=${address}&tag=latest&apikey=${ETHERSCAN_API_KEY}`
    const response = await axios.get(url)
    return response.data.result
}

// 获取 ERC20 代币余额的函数
const getERC20Balances = async (address) => {
    const url = `https://api.etherscan.io/api?module=account&action=tokentx&address=${address}&startblock=0&endblock=999999999&sort=asc&apikey=${ETHERSCAN_API_KEY}`
    const response = await axios.get(url)
    return response.data.result
}

// 获取近一个月交易记录的函数
const getRecentTransactions = async (address) => {
    const oneMonthAgo = Math.floor(Date.now() / 1000) - 30 * 24 * 60 * 60
    const url = `https://api.etherscan.io/api?module=account&action=txlist&address=${address}&startblock=0&endblock=99999999&sort=desc&apikey=${ETHERSCAN_API_KEY}`
    const response = await axios.get(url)
    return response.data.result.filter(tx => tx.timeStamp > oneMonthAgo)
}

// 导出 createRequest 函数
module.exports = { createRequest }
