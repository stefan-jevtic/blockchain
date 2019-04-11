"use strict";

const sha256 = require('sha256');
const uuid = require('uuid');

class Blockchain {
    constructor(){
        this.chain = [];
        this.pendingTransactions = [];
        this.createNewBlock(100, '0', '0');
        this.currentNodeUrl = process.argv[3];
        this.networkNodes = [];
    }

    createNewBlock(nonce, previousBlockHash, hash){
        const newBlock = {
            index: this.chain.length + 1,
            timestamp: Date.now(),
            transactions: this.pendingTransactions,
            nonce,
            hash,
            previousBlockHash
        }

        this.pendingTransactions = [];
        this.chain.push(newBlock);

        return newBlock;
    }

    getLastBlock(){
        return this.chain[this.chain.length - 1]
    }

    createNewTransaction(amount, sender, recipient){
        const newTransaction = {
            transactionId: uuid().split('-').join(''),
            amount,
            sender,
            recipient
        }

        return newTransaction;
    }

    addTransactionToPendingTransactions(transactionObj){
        this.pendingTransactions.push(transactionObj);
        return this.getLastBlock()['index'] + 1;
    }

    hashBlock(previousBlockHash, currentBlockData, nonce){
        const data = previousBlockHash + nonce + JSON.stringify(currentBlockData);
        const hash = sha256(data);
        return hash;
    }

    proofOfWork(previousBlockHash, currentBlockData){
        let nonce = 0;
        let hash = this.hashBlock(previousBlockHash, currentBlockData, nonce);
        while(hash.substring(0, 4) !== '0000'){
            nonce++;
            hash = this.hashBlock(previousBlockHash, currentBlockData, nonce);
        }
        return nonce;
    }

    chainIsValid(blockchain){
        for(let i = 1; i < blockchain.length; i++) {
            const currentBlock = blockchain[i];
            const previousBlock = blockchain[i-1];
            const blockHash = this.hashBlock(previousBlock.hash, {transactions: currentBlock.transactions, index: currentBlock.index}, currentBlock.nonce )
            if(blockHash.substring(0, 4) !== '0000')
                return false;
            if(currentBlock.previousBlockHash !== previousBlock.hash)
                return false;
        }
        const genesis = blockchain[0];
        const correctNonce = genesis.nonce === 100;
        const correctPreviousBlockHash = genesis.previousBlockHash === '0';
        const correctHash = genesis.hash === '0'
        const correctTransactions = genesis.transactions.length === 0;
        if(!correctNonce || !correctPreviousBlockHash || !correctHash || !correctTransactions)
            return false;

        return true;
    }

    getBlock(blockHash){
        let correctBlock = this.chain.filter(block => {
            return block.hash === blockHash
        })
        return correctBlock[0];
    }

    getTransaction(trId){
        let transaction = null;
        let block = null;
        for(let i = 0; i < this.chain.length; i++) {
            let { transactions } = this.chain[i];
            for(let j = 0; j < transactions.length; j++) {
                let { transactionId } = transactions[j];
                if(transactionId === trId){
                    transaction = transactions[j];
                    block = this.chain[i];
                    break;
                }
            }
        }
        return { transaction, block };
    }

    getAddressData(address){
        let addressTransactions = [];
        this.chain.forEach(block => 
            addressTransactions.push(...block.transactions.filter(
                t => t.sender === address || t.recipient === address
            ))
        );
        let balance = 0;
        addressTransactions.forEach(t => {
            if(t.recipient === address) balance += t.amount
            else if(t.sender === address) balance -= t.amount 
        })

        return {
            addressTransactions,
            addressBalance: balance
        }
    }
}

module.exports = Blockchain;