module.exports = (Block, cryptoData, cryptoHash) => {
    return new Block(0, '0', new Date().getTime(), cryptoData, cryptoHash);
};
