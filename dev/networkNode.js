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
    const newTransaction = req.body;
    const blockIndex = bitcoin.addTransactionToPendingTransactions(newTransaction);
    res.json({ note: `Transaction will be added in block ${blockIndex}.`})
});

app.post('/transaction/broadcast', (req, res) => {
    const { amount, sender, recipient } = req.body;
    const newTransaction = bitcoin.createNewTransaction(amount, sender, recipient);
    bitcoin.addTransactionToPendingTransactions(newTransaction);
    const promises = bitcoin.networkNodes.map(networkNode => {
        const requsetOptions = {
            uri: `${networkNode}/transaction`,
            method: 'POST',
            body: newTransaction,
            json: true
        }
        return sendRequest(requsetOptions);
    });

    Promise.all(promises)
        .then(data => {
            res.json({ note: "Transaction created and broadcast successfully." });
        });
})

app.get('/mine', (req, res) => {
    const lastBlock = bitcoin.getLastBlock();
    const previousBlockHash = lastBlock['hash'];
    const currentBlockData = {
        transactions: bitcoin.pendingTransactions,
        index: lastBlock['index'] + 1
    }
    const nonce = bitcoin.proofOfWork(previousBlockHash, currentBlockData);
    const blockHash = bitcoin.hashBlock(previousBlockHash, currentBlockData, nonce);
    const newBlock = bitcoin.createNewBlock(nonce, previousBlockHash, blockHash);
    
    const promises = bitcoin.networkNodes.map(networkNode => {
        const reqOptions = {
            uri: `${networkNode}/receive-new-block`,
            method: 'POST',
            body: { newBlock },
            json: true
        }

        return sendRequest(reqOptions);
    })

    Promise.all(promises)
        .then(data => {
            // Mining reward transaction
            const reqOpts = {
                uri: `${bitcoin.currentNodeUrl}/transaction/broadcast`,
                method: 'POST',
                body: {
                    amount: 12.5,
                    sender: "00",
                    recipient: nodeAddress
                },
                json: true
            }
            return sendRequest(reqOpts)
        })
        .then(data => {
            res.json({
                note: "New block mined and broadcast successfully!",
                block: newBlock
            });
        })
});

app.post('/receive-new-block', (req, res) => {
    const { newBlock } = req.body;
    const lastBlock = bitcoin.getLastBlock();
    if(lastBlock.hash === newBlock.previousBlockHash && lastBlock["index"] + 1 === newBlock['index']) {
        bitcoin.chain.push(newBlock);
        bitcoin.pendingTransactions = [];
        res.json({
            note: "New block received and accepted.",
            newBlock
        })
    }    
    else {
        res.json({ note: "New block rejected!", newBlock });
    }

})

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

app.get('/consensus', (req, res) => {
    const promises = bitcoin.networkNodes.map(networkNode => {
        const reqOpts = {
            uri: `${networkNode}/blockchain`,
            method: 'GET',
            json: true
        }
        return sendRequest(reqOpts);
    });

    Promise.all(promises)
        .then(blockchains => {
            const currChainLength = bitcoin.chain.length;
            let max = currChainLength;
            let newLongestChain = null;
            let newPendingTransactions = null;
            blockchains.map(obj => {
                const blockchain = obj.body;
                if(blockchain.chain.length > max){
                    max = blockchain.chain.length;
                    newLongestChain = blockchain.chain;
                    newPendingTransactions = blockchain.pendingTransactions;
                }
            });

            if(!newLongestChain || (newLongestChain && !bitcoin.chainIsValid(newLongestChain))){
                res.json({
                    note: "Current chain not been replaced.",
                    chain: bitcoin.chain
                })
            }
            else {
                bitcoin.chain = newLongestChain;
                bitcoin.pendingTransactions = newPendingTransactions;
                res.json({
                    note: "Current chain has been replaced.",
                    chain: bitcoin.chain
                });
            }
        })
})

app.get('/block/:blockHash', (req, res) => {
    const { blockHash } = req.params;
    const block = bitcoin.getBlock(blockHash);
    res.json({ block });
});

app.get('/transaction/:transactionId', (req, res) => {
    const { transactionId } = req.params;
    const data = bitcoin.getTransaction(transactionId);
    res.json(data);
});

app.get('/address/:address', (req, res) => {
    const { address } = req.params;
    const data = bitcoin.getAddressData(address);
    res.json(data);
});

app.get('/block-explorer', (req, res) => {
    res.sendFile('./block-explorer/index.html', { root: __dirname})
})

function sendRequest(url) {
    return new Promise((resolve, reject) => {
        request(url, (err, res, body) => {
            if(err) reject(err)
            resolve(res);
        })
    })
}

app.listen(port, () => console.log(`Express server running on: http://localhost:${port}`));