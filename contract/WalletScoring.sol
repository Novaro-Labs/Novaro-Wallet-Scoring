// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@chainlink/contracts/src/v0.8/ChainlinkClient.sol";
import "@chainlink/contracts/src/v0.8/automation/AutomationCompatible.sol";

/// @title 钱包评分合约
/// @notice 该合约用于计算和存储钱包地址的评分信息
contract WalletScoring is ChainlinkClient, AutomationCompatibleInterface {
    using Chainlink for Chainlink.Request;

    // 钱包评分数据结构
    struct TokenBalance {
        address tokenAddress;
        string symbol;
        uint256 balance;
        uint8 decimals;
    }

    struct WalletScore {
        uint256 score;
        uint256 lastUpdated;
        uint256 ethBalance;
        TokenBalance[] tokenBalances;
        uint256 normalTxCount;
        uint256 tokenTxCount;
        uint256 totalValue;
    }

    // 存储每个钱包地址对应的评分信息
    mapping(address => WalletScore) public walletScores;
    
    // Chainlink 相关变量
    address private oracle;      // 预言机地址
    bytes32 private jobId;       // 工作ID
    uint256 private fee;         // 预言机费用
    uint256 public interval;     // 更新间隔
    uint256 public lastTimeStamp;// 上次更新时间戳

    /// @notice 构造函数
    /// @param _oracle 预言机地址
    /// @param _jobId 工作ID
    /// @param _fee LINK代币费用
    constructor(address _oracle, bytes32 _jobId, uint256 _fee) {
        setChainlinkToken(0x326C977E6efc84E512bB9C30f76E30c160eD06FB);  // Goerli测试网LINK代币地址
        oracle = _oracle;
        jobId = _jobId;
        fee = _fee;
        interval = 1 days;
        lastTimeStamp = block.timestamp;
    }

    /// @notice 请求获取钱包数据
    /// @param _wallet 要查询的钱包地址
    /// @return requestId 请求ID
    function requestWalletData(address _wallet) public returns (bytes32) {
        Chainlink.Request memory req = buildChainlinkRequest(jobId, address(this), this.fulfill.selector);
        req.add("wallet", toAsciiString(_wallet));
        return sendChainlinkRequest(req, fee);
    }

    /// @notice 预言机回调函数，接收并处理返回的数据
    /// @param _requestId 请求ID
    /// @param _ethBalance ETH余额
    /// @param _totalValue 总价值
    /// @param _normalTxCount 普通交易数量
    /// @param _tokenTxCount 代币交易数量
    /// @param _tokenBalances 代币余额
    function fulfill(
        bytes32 _requestId, 
        uint256 _ethBalance,
        uint256 _totalValue,
        uint256 _normalTxCount,
        uint256 _tokenTxCount,
        TokenBalance[] memory _tokenBalances
    ) public recordChainlinkFulfillment(_requestId) {
        address wallet = // 从请求ID获取钱包地址
        
        uint256 score = calculateScore(
            _ethBalance,
            _totalValue,
            _normalTxCount,
            _tokenTxCount,
            _tokenBalances
        );
        
        // 更新钱包评分信息
        WalletScore storage userScore = walletScores[wallet];
        userScore.score = score;
        userScore.lastUpdated = block.timestamp;
        userScore.ethBalance = _ethBalance;
        userScore.totalValue = _totalValue;
        userScore.normalTxCount = _normalTxCount;
        userScore.tokenTxCount = _tokenTxCount;
        
        // 更新代币余额
        delete userScore.tokenBalances;
        for(uint i = 0; i < _tokenBalances.length; i++) {
            userScore.tokenBalances.push(_tokenBalances[i]);
        }
    }

    /// @notice 计算评分
    /// @param _ethBalance ETH余额
    /// @param _totalValue 总价值
    /// @param _normalTxCount 普通交易数量
    /// @param _tokenTxCount 代币交易数量
    /// @param _tokenBalances 代币余额
    /// @return 计算得出的评分
    function calculateScore(
        uint256 _ethBalance,
        uint256 _totalValue,
        uint256 _normalTxCount,
        uint256 _tokenTxCount,
        TokenBalance[] memory _tokenBalances
    ) internal pure returns (uint256) {
        // 评分权重：
        // 总价值: 40%
        // 代币多样性: 20%
        // 交易活跃度: 40%
        
        uint256 valueScore = (_totalValue * 40) / 100;
        uint256 diversityScore = (_tokenBalances.length * 20) / 100;
        uint256 activityScore = ((_normalTxCount + _tokenTxCount) * 40) / 100;
        
        return valueScore + diversityScore + activityScore;
    }

    /// @notice Chainlink Automation检查是否需要更新
    function checkUpkeep(bytes calldata) external view override returns (bool upkeepNeeded, bytes memory) {
        upkeepNeeded = (block.timestamp - lastTimeStamp) > interval;
    }

    /// @notice Chainlink Automation执行更新操作
    function performUpkeep(bytes calldata) external override {
        if ((block.timestamp - lastTimeStamp) > interval) {
            lastTimeStamp = block.timestamp;
            // 触发更新评分
            // 这里可以实现批量更新逻辑
        }
    }

    /// @notice 将地址转换为ASCII字符串
    /// @param x 要转换的地址
    /// @return 转换后的字符串
    function toAsciiString(address x) internal pure returns (string memory) {
        bytes memory s = new bytes(40);
        for (uint i = 0; i < 20; i++) {
            bytes1 b = bytes1(uint8(uint(uint160(x)) / (2**(8*(19 - i)))));
            bytes1 hi = bytes1(uint8(b) / 16);
            bytes1 lo = bytes1(uint8(b) - 16 * uint8(hi));
            s[2*i] = char(hi);
            s[2*i+1] = char(lo);            
        }
        return string(s);
    }

    /// @notice 将字节转换为字符
    /// @param b 要转换的字节
    /// @return 转换后的字符
    function char(bytes1 b) internal pure returns (bytes1 c) {
        if (uint8(b) < 10) return bytes1(uint8(b) + 0x30);
        else return bytes1(uint8(b) + 0x57);
    }
} 