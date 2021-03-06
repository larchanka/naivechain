/*
 * Originally written by Lauri Hartikka
 * Modified by Mikhail Larchanka
 * Twitter: https://twitter.com/MLarchanka
 */

const CryptoJS = require('crypto-js');
const Express = require('express');
const BodyParser = require('body-parser');
const WebSocket = require('ws');
const Colors = require('colors');

// Connection parameters
const HTTP_PORT = process.env.HTTP_PORT || 3001;
const P2P_PORT = process.env.P2P_PORT || 6001;
const INITIAL_PEERS = process.env.PEERS ? process.env.PEERS.split(',') : [];

// Chain parameters
const CRYPTO_DATA = process.env.CRYPTO_DATA || 'this-is-block-data-!!!';
const CRYPTO_HASH =
    process.env.CRYPTO_HASH ||
    '816534932c2b7154836da6afc367695e6337db8a921823784c14378abed4f7d7';

// Array of available sockets
const sockets = [];

// Messages definition
const MessageType = {
    QUERY_LATEST: 0,
    QUERY_ALL: 1,
    RESPONSE_BLOCKCHAIN: 2,
};

// Class definition
class Block {
    constructor(index, previousHash, timestamp, data, hash) {
        this.index = index;
        this.previousHash = previousHash.toString();
        this.timestamp = timestamp;
        this.data = data;
        this.hash = hash.toString();
    }
}

// Genesis block generator
const getGenesisBlock = () => {
    return new Block(0, '0', 1465154705, CRYPTO_DATA, CRYPTO_HASH);
};

// Inmemory blockchain storage
const blockchain = [getGenesisBlock()];

// HTTP server
const initHttpServer = () => {
    const app = Express();
    app.use(BodyParser.json());

    app.get('/blocks', (req, res) => res.send(JSON.stringify(blockchain)));
    app.post('/mineBlock', (req, res) => {
        const newBlock = generateNextBlock(req.body.data);
        addBlock(newBlock);
        broadcast(responseLatestMsg());
        console.log('Block added:'.green, JSON.stringify(newBlock));
        res.send();
    });
    app.get('/peers', (req, res) => {
        res.send(
            sockets.map(
                s => `${s._socket.remoteAddress}:${s._socket.remotePort}`
            )
        );
    });
    app.post('/addPeer', (req, res) => {
        connectToPeers([req.body.peer]);
        res.send();
    });
    app.listen(HTTP_PORT, () =>
        console.log('Listening http on port:'.yellow, HTTP_PORT)
    );
};

// Web-socket server
const initP2PServer = () => {
    const server = new WebSocket.Server({ port: P2P_PORT });
    server.on('connection', ws => initConnection(ws));
    console.log('Listening websocket p2p port on:'.yellow, P2P_PORT);
};

// Web-socket connector
const initConnection = ws => {
    sockets.push(ws);
    initMessageHandler(ws);
    initErrorHandler(ws);
    write(ws, queryChainLengthMsg());
};

// Web-socket message handler
const initMessageHandler = ws => {
    ws.on('message', data => {
        const message = JSON.parse(data);
        console.log('Received message'.green, JSON.stringify(message));
        switch (message.type) {
            case MessageType.QUERY_LATEST:
                write(ws, responseLatestMsg());
                break;
            case MessageType.QUERY_ALL:
                write(ws, responseChainMsg());
                break;
            case MessageType.RESPONSE_BLOCKCHAIN:
                handleBlockchainResponse(message);
                break;
        }
    });
};

// Web-socket error handler
const initErrorHandler = ws => {
    const closeConnection = ws => {
        console.log('Connection failed to peer:'.red, ws.url);
        sockets.splice(sockets.indexOf(ws), 1);
    };
    ws.on('close', () => closeConnection(ws));
    ws.on('error', () => closeConnection(ws));
};

// Block generator
const generateNextBlock = blockData => {
    const previousBlock = getLatestBlock();
    const nextIndex = previousBlock.index + 1;
    const nextTimestamp = new Date().getTime() / 1000;
    const nextHash = calculateHash(
        nextIndex,
        previousBlock.hash,
        nextTimestamp,
        blockData
    );
    return new Block(
        nextIndex,
        previousBlock.hash,
        nextTimestamp,
        blockData,
        nextHash
    );
};

// Block hash generator
const calculateHashForBlock = block => {
    return calculateHash(
        block.index,
        block.previousHash,
        block.timestamp,
        block.data
    );
};

// Hash calculation utility
const calculateHash = (index, previousHash, timestamp, data) => {
    return CryptoJS.SHA256(
        `${index}${previousHash}${timestamp}${data}`
    ).toString();
};

// Block adding utility
const addBlock = newBlock => {
    if (isValidNewBlock(newBlock, getLatestBlock())) {
        blockchain.push(newBlock);
    }
};

// Block validation utility
const isValidNewBlock = (newBlock, previousBlock) => {
    if (previousBlock.index + 1 !== newBlock.index) {
        console.log('Invalid index'.red);
        return false;
    } else if (previousBlock.hash !== newBlock.previousHash) {
        console.log('Invalid previoushash'.red);
        return false;
    } else if (calculateHashForBlock(newBlock) !== newBlock.hash) {
        console.log(
            `${typeof newBlock.hash} ${typeof calculateHashForBlock(newBlock)}`
                .magenta
        );
        console.log(
            'Invalid hash:'.red,
            calculateHashForBlock(newBlock),
            newBlock.hash
        );
        return false;
    }
    return true;
};

// Peer connection utility
const connectToPeers = newPeers => {
    newPeers.forEach(peer => {
        const ws = new WebSocket(peer);
        ws.on('open', () => initConnection(ws));
        ws.on('error', () => {
            console.log('Connection failed'.red);
        });
    });
};

// Blockchain response handler
const handleBlockchainResponse = message => {
    const receivedBlocks = JSON.parse(message.data).sort(
        (b1, b2) => b1.index - b2.index
    );
    const latestBlockReceived = receivedBlocks[receivedBlocks.length - 1];
    const latestBlockHeld = getLatestBlock();
    if (latestBlockReceived.index > latestBlockHeld.index) {
        console.log(
            'Blockchain possibly behind. We got:'.yellow,
            latestBlockHeld.index,
            'Peer got:',
            latestBlockReceived.index
        );
        if (latestBlockHeld.hash === latestBlockReceived.previousHash) {
            console.log('We can append the received block to our chain'.yellow);
            blockchain.push(latestBlockReceived);
            broadcast(responseLatestMsg());
        } else if (receivedBlocks.length === 1) {
            console.log('We have to query the chain from our peer'.yellow);
            broadcast(queryAllMsg());
        } else {
            console.log(
                'Received blockchain is longer than current blockchain'.yellow
            );
            replaceChain(receivedBlocks);
        }
    } else {
        console.log(
            'Received blockchain is not longer than received blockchain. Do nothing'
                .yellow
        );
    }
};

// Longest chain seletor
const replaceChain = newBlocks => {
    if (isValidChain(newBlocks) && newBlocks.length > blockchain.length) {
        console.log(
            `Received blockchain is valid.
            Replacing current blockchain with received blockchain`.yellow
        );
        blockchain = newBlocks;
        broadcast(responseLatestMsg());
    } else {
        console.log('Received blockchain invalid'.yellow);
    }
};


// Chain validation utility
const isValidChain = blockchainToValidate => {
    if (
        JSON.stringify(blockchainToValidate[0]) !==
        JSON.stringify(getGenesisBlock())
    ) {
        return false;
    }
    const tempBlocks = [blockchainToValidate[0]];
    for (const i = 1; i < blockchainToValidate.length; i++) {
        if (isValidNewBlock(blockchainToValidate[i], tempBlocks[i - 1])) {
            tempBlocks.push(blockchainToValidate[i]);
        } else {
            return false;
        }
    }
    return true;
};

// Service startup
const getLatestBlock = () => blockchain[blockchain.length - 1];
const queryChainLengthMsg = () => ({ type: MessageType.QUERY_LATEST });
const queryAllMsg = () => ({ type: MessageType.QUERY_ALL });
const responseChainMsg = () => ({
    type: MessageType.RESPONSE_BLOCKCHAIN,
    data: JSON.stringify(blockchain),
});
const responseLatestMsg = () => ({
    type: MessageType.RESPONSE_BLOCKCHAIN,
    data: JSON.stringify([getLatestBlock()]),
});

const write = (ws, message) => ws.send(JSON.stringify(message));
const broadcast = message => sockets.forEach(socket => write(socket, message));

const init = () => {
    connectToPeers(INITIAL_PEERS);
    initHttpServer();
    initP2PServer();
};

module.exports = init;
