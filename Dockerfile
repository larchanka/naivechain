FROM node:6.10.0

RUN mkdir /naivechain
ADD package.json /naivechain/
ADD index.js /naivechain/

RUN cd /naivechain && npm install

EXPOSE 3001
EXPOSE 6001

ENTRYPOINT cd /naivechain && npm install && PEERS=$PEERS npm start