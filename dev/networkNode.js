const express = require('express');
const app = express();
const bodyParser = require('body-parser');
const Blockchain = require('./blockchain');
const uuid = require('uuid/v1');
const port = process.argv[2];
const request = require('request');
const nodeAddress = uuid().split('-').join('');
const bitcoin = new Blockchain();

app.use(bodyParser.json())
app.use(bodyParser.urlencoded({extended: false}));

app.get('/blockchain', (req, res) => {
    res.send(bitcoin);
});

app.post('/transaction', (req, res) => {
    const { amount, sender, recipient } = req.body;
    const blockIndex = bitcoin.createNewTransaction(amount, sender, recipient);
    res.json({ note: `Transaction will be added in block ${blockIndex}`});
});

app.get('/mine', (req, res) => {
    const lastBlock = bitcoin.getLastBlock();
    const previousBlockHash = lastBlock['hash'];
    const currentBlockData = {
        transactions: bitcoin.pendingTransactions,
        index: lastBlock['index'] + 1
    }
    const nonce = bitcoin.proofOfWork(previousBlockHash, currentBlockData);
    const blockHash = bitcoin.hashBlock(previousBlockHash, currentBlockData, nonce);
    bitcoin.createNewTransaction(12.5, "00", nodeAddress);
    const newBlock = bitcoin.createNewBlock(nonce, previousBlockHash, blockHash);
    res.json({
        note: "New block mined successfully!",
        block: newBlock
    });
});

// register node and broadcast it the network
app.post('/register-and-broadcast-node', (req, res) => {
    const { newNodeUrl } = req.body;
    if(bitcoin.networkNodes.indexOf(newNodeUrl) === -1)
        bitcoin.networkNodes.push(newNodeUrl);
        
    let promises = bitcoin.networkNodes.map(nodeUrl => {
        const requsetOptions = {
            uri: `${nodeUrl}/register-node`,
            method: 'POST',
            body: { newNodeUrl },
            json: true
        }
        return sendRequest(requsetOptions);
    })
    Promise.all(promises)
        .then(data => {
            const bulkRegOptions = {
                uri: `${newNodeUrl}/register-nodes-bulk`,
                method: 'POST',
                body: { allNetworkNodes: [...bitcoin.networkNodes, bitcoin.currentNodeUrl] },
                json: true
            }

            return sendRequest(bulkRegOptions)
        })
        .then(data => {
            res.json({ note: "New node registed with network successfully." });
        })
})

// register a node with network
app.post('/register-node', (req, res) => {
    const { newNodeUrl } = req.body;
    if(bitcoin.networkNodes.indexOf(newNodeUrl) === -1 && bitcoin.currentNodeUrl !== newNodeUrl)
        bitcoin.networkNodes.push(newNodeUrl);
    res.json({ note: "New node registred successfully." })
})

// register multiple nodes at once
app.post('/register-nodes-bulk', (req, res) => {
    const { allNetworkNodes } = req.body;
    allNetworkNodes.map(nodeUrl => {
        if(bitcoin.networkNodes.indexOf(nodeUrl) === -1 && bitcoin.currentNodeUrl !== nodeUrl)
            bitcoin.networkNodes.push(nodeUrl);
    })
    res.json({ note: "Bulk registration successful."});
})

function sendRequest(url) {
    return new Promise((resolve, reject) => {
        request.post(url, (err, res, body) => {
            if(err) reject(err)
            resolve(res);
        })
    })
}

app.listen(port, () => console.log(`Express server running on: http://localhost:${port}`));