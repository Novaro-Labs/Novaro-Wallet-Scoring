// test.js
const createRequest = require('../external-adapter').createRequest
// 测试钱包地址
const testWalletAddress = "0x742d35Cc6634C0532925a3b844Bc454e4438f44e";  // 示例地址

const mockRequest = {
  id: "1",
  data: {
    walletAddress: testWalletAddress
  }
};

createRequest(mockRequest, (statusCode, data) => {
  console.log("Status:", statusCode);
  console.log("Data:", JSON.stringify(data, null, 2));
});