const Express = require('express');
const BodyParser = require('body-parser');

module.exports = ({
    BlockChain,
    generateNextBlock,
    addBlock,
    broadcast,
    responseLatestMsg,
    sockets,
    connectToPeers,
    httpPort,
}) => {
    const app = Express();
    app.use(BodyParser.json());

    app.get('/blocks', (req, res) => res.send(JSON.stringify(BlockChain)));
    app.post('/addBlock', (req, res) => {
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
    app.listen(httpPort, () =>
        console.log('Listening http on port:'.yellow, httpPort)
    );
};
