module.exports = genesisBlock => {
    if (genesisBlock) {
        return [genesisBlock];
    }
    return [];
};
