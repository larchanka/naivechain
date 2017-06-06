const CryptoJS = require('crypto-js');

module.exports = (index, previousHash, timestamp, data) => {
    return CryptoJS.SHA256(
        `${index}${previousHash}${timestamp}${data}`
    ).toString();
};
