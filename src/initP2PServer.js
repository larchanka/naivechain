const WebSocket = require('ws');

module.exports = ({
    p2pPort,
    initConnection
}) => {
    const server = new WebSocket.Server({ port: p2pPort });
    server.on('connection', ws => initConnection(ws));
    console.log('Listening websocket p2p on port:'.yellow, p2pPort);
};
