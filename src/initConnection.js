module.exports = ({
    sockets,
    initMessageHandler,
    initErrorHandler,
    queryChainLengthMsg,
    write,
    ws
}) => {
    sockets.push(ws);
    initMessageHandler(ws);
    initErrorHandler(ws);
    write(ws, queryChainLengthMsg());
};
