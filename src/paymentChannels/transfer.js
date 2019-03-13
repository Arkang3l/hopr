'use strict'

const { waterfall, queue } = require('neo-async')
const BN = require('bn.js')

const { isPartyA, getId, pubKeyToEthereumAddress, bufferToNumber, numberToBuffer, deepCopy, log } = require('../utils')
const Transaction = require('../transaction')

module.exports = (self) => {
    const queues = new Map()

    const foo = (options, cb) => waterfall([
        (cb) => self.getChannel(options.channelId, cb),
        (record, cb) => {
            if (typeof record === 'function') {
                cb = record
                record = null
            }

            log(self.node.peerInfo.id, `here ${options.channelId.toString('hex')}`)
            if (record)
                return cb(null, record)

            if (self.openingRequests.has(options.channelId.toString('base64')))
                console.log('found')
            log(self.node.peerInfo.id, `after first callback ${options.channelId.toString('hex')}`)
            
            self.open(options.to, cb)

        },
        (record, cb) => {
            console.log(`opened ${options.channelId.toString('hex')}`)
            const currentValue = new BN(record.currentValue)

            const partyA = isPartyA(
                pubKeyToEthereumAddress(self.node.peerInfo.id.pubKey.marshal()),
                pubKeyToEthereumAddress(options.to.pubKey.marshal()))

            if (partyA) {
                currentValue.isub(options.amount)
                if (currentValue.isNeg())
                    return cb(Error(`Insufficient funds. Please equip the payment channel with at least ${currentValue.abs().toString()} additional wei.`))
            } else {
                currentValue.iadd(options.amount)

                const totalBalance = new BN(record.totalBalance)
                if (currentValue.gt(totalBalance))
                    return cb(Error(`Insufficient funds. Please equip the payment channel with at least ${currentValue.sub(totalBalance).toString()} additional wei.`))
            }

            const newTx = deepCopy(record.tx, Transaction)

            newTx.value = currentValue.toBuffer('be', Transaction.VALUE_LENGTH)
            newTx.index = numberToBuffer(bufferToNumber(record.index) + 1, Transaction.INDEX_LENGTH)
            newTx.sign(self.node.peerInfo.id)

            record.currentValue = currentValue.toBuffer('be', Transaction.VALUE_LENGTH)
            record.index = numberToBuffer(bufferToNumber(record.index) + 1, Transaction.INDEX_LENGTH)

            self.setChannel(record, { channelId: options.channelId, sync: true }, (err) => {
                if (err)
                    return cb(err)

                options.done(null, newTx)

                setImmediate(cb)
            })
        }
    ], cb)

    return (amount, to, cb) => {
        const channelId = getId(
            pubKeyToEthereumAddress(self.node.peerInfo.id.pubKey.marshal()),
            pubKeyToEthereumAddress(to.pubKey.marshal())
        )

        let pendingJobs = queues.get(channelId.toString('base64'))
        if (!pendingJobs) {
            pendingJobs = queue(foo, 1)
        }

        pendingJobs.push({
            amount: amount,
            to: to,
            channelId: channelId,
            done: cb
        })

        queues.set(channelId.toString('base64'), pendingJobs)
    }
}