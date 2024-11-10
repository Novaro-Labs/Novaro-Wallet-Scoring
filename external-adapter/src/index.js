const { Requester, Validator } = require('@chainlink/external-adapter')
const { ethers } = require('ethers')
const axios = require('axios')
require('dotenv').config()

// 创建 Express 服务器
const express = require('express')
const bodyParser = require('body-parser')
const app = express()
const port = process.env.PORT || 8080

app.use(bodyParser.json())

// API 配置
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY
const ETHERSCAN_API = 'https://api.etherscan.io/api'
const COINGECKO_API = 'https://api.coingecko.com/api/v3'

// 验证参数结构
const customParams = {
    wallet: ['wallet']
}

// 主要请求处理函数
const createRequest = async (input, callback) => {
    try {
        const validator = new Validator(input, customParams)
        const jobRunID = validator.validated.id
        const wallet = validator.validated.data.wallet

        console.log(`Processing request ${jobRunID} for wallet ${wallet}`)

        // 获取数据
        const [ethBalance, tokenData, txData] = await Promise.all([
            getEthBalance(wallet),
            getTokenBalances(wallet),
            getTransactions(wallet)
        ])

        // 计算总价值
        const totalValue = await calculateTotalValue(ethBalance, tokenData.tokenBalances)

        const response = {
            jobRunID,
            data: {
                ethBalance: ethBalance.toString(),
                tokenBalances: tokenData.tokenBalances,
                transactions: txData,
                totalValue: totalValue.toString(),
                normalTxCount: txData.normalTransactions.length,
                tokenTxCount: txData.tokenTransactions.length
            },
            statusCode: 200
        }

        callback(200, response)
    } catch (error) {
        console.error('Error: ', error)
        callback(500, {
            jobRunID: input.id,
            status: 'errored',
            error: error.message,
            statusCode: 500
        })
    }
}

// 获取 ETH 余额
async function getEthBalance(address) {
    const provider = new ethers.providers.JsonRpcProvider(process.env.RPC_URL)
    return await provider.getBalance(address)
}

// 获取代币余额
async function getTokenBalances(address) {
    try {
        const response = await axios.get(ETHERSCAN_API, {
            params: {
                module: 'account',
                action: 'tokentx',
                address: address,
                apikey: ETHERSCAN_API_KEY,
                sort: 'desc'
            }
        })

        if (response.data.status !== '1') {
            throw new Error(`Etherscan API error: ${response.data.message}`)
        }

        // 获取唯一的代币合约地址
        const uniqueTokens = [...new Set(response.data.result.map(tx => tx.contractAddress))]

        // 获取每个代币的详细信息和余额
        const tokenBalances = await Promise.all(uniqueTokens.map(async (tokenAddress) => {
            const [tokenInfo, balance] = await Promise.all([
                getTokenInfo(tokenAddress),
                getTokenBalance(address, tokenAddress)
            ])

            return {
                tokenAddress,
                symbol: tokenInfo.symbol,
                name: tokenInfo.name,
                decimals: parseInt(tokenInfo.decimals),
                balance: balance
            }
        }))

        return {
            tokenBalances: tokenBalances.filter(token => token.balance > 0)
        }
    } catch (error) {
        console.error('Error fetching token balances:', error)
        throw error
    }
}

// 获取代币信息
async function getTokenInfo(tokenAddress) {
    const response = await axios.get(ETHERSCAN_API, {
        params: {
            module: 'token',
            action: 'tokeninfo',
            contractaddress: tokenAddress,
            apikey: ETHERSCAN_API_KEY
        }
    })

    if (response.data.status !== '1') {
        throw new Error(`Error getting token info: ${response.data.message}`)
    }

    return response.data.result[0]
}

// 获取特定代币余额
async function getTokenBalance(address, tokenAddress) {
    const response = await axios.get(ETHERSCAN_API, {
        params: {
            module: 'account',
            action: 'tokenbalance',
            contractaddress: tokenAddress,
            address: address,
            apikey: ETHERSCAN_API_KEY
        }
    })

    if (response.data.status !== '1') {
        throw new Error(`Error getting token balance: ${response.data.message}`)
    }

    return response.data.result
}

// 获取交易历史
async function getTransactions(address) {
    const oneMonthAgo = Math.floor(Date.now() / 1000) - (30 * 24 * 60 * 60)

    try {
        const [normalTxResponse, tokenTxResponse] = await Promise.all([
            // 获取普通交易
            axios.get(ETHERSCAN_API, {
                params: {
                    module: 'account',
                    action: 'txlist',
                    address: address,
                    starttime: oneMonthAgo,
                    apikey: ETHERSCAN_API_KEY,
                    sort: 'desc'
                }
            }),
            // 获取代币交易
            axios.get(ETHERSCAN_API, {
                params: {
                    module: 'account',
                    action: 'tokentx',
                    address: address,
                    starttime: oneMonthAgo,
                    apikey: ETHERSCAN_API_KEY,
                    sort: 'desc'
                }
            })
        ])

        return {
            normalTransactions: normalTxResponse.data.result,
            tokenTransactions: tokenTxResponse.data.result
        }
    } catch (error) {
        console.error('Error fetching transactions:', error)
        throw error
    }
}

// 计算总价值
async function calculateTotalValue(ethBalance, tokenBalances) {
    try {
        // 获取 ETH 价格
        const ethPrice = await getEthPrice()
        let totalValue = ethers.BigNumber.from(ethBalance)

        // 获取代币价格并计算总价值
        for (const token of tokenBalances) {
            try {
                const tokenPrice = await getTokenPrice(token.symbol)
                if (tokenPrice) {
                    const tokenValue = ethers.BigNumber.from(token.balance)
                        .mul(ethers.BigNumber.from(Math.floor(tokenPrice * 1e18)))
                        .div(ethers.BigNumber.from(10).pow(token.decimals))
                    totalValue = totalValue.add(tokenValue)
                }
            } catch (error) {
                console.warn(`Could not get price for token ${token.symbol}`)
            }
        }

        return totalValue.toString()
    } catch (error) {
        console.error('Error calculating total value:', error)
        return ethBalance // 如果出错，返回 ETH 余额作为总价值
    }
}

// 获取 ETH 价格
async function getEthPrice() {
    try {
        const response = await axios.get(`${COINGECKO_API}/simple/price`, {
            params: {
                ids: 'ethereum',
                vs_currencies: 'usd'
            }
        })
        return response.data.ethereum.usd
    } catch (error) {
        console.error('Error fetching ETH price:', error)
        return 1 // 默认值
    }
}

// 获取代币价格
async function getTokenPrice(symbol) {
    try {
        const response = await axios.get(`${COINGECKO_API}/simple/price`, {
            params: {
                ids: symbol.toLowerCase(),
                vs_currencies: 'usd'
            }
        })
        return response.data[symbol.toLowerCase()]?.usd || 0
    } catch (error) {
        console.error(`Error fetching price for ${symbol}:`, error)
        return 0
    }
}

// 设置 Express 路由
app.post('/', (req, res) => {
    console.log('POST Data: ', req.body)
    createRequest(req.body, (statusCode, data) => {
        res.status(statusCode).json(data)
    })
})

// 健康检查端点
app.get('/', (req, res) => {
    res.json({ status: 'ok' })
})

// 启动服务器
app.listen(port, () => console.log(`Adapter listening on port ${port}!`))

// 导出 createRequest 函数供测试使用
module.exports.createRequest = createRequest