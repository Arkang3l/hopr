'use stric'

const { times } = require('neo-async')

/**
 * Allow nodes to find each other by establishing connections
 * between adjacent nodes.
 * 
 * Connection from A -> B, B -> C, C -> D, ...
 * 
 * @param {Hopper} nodes nodes that will have open connections afterwards
 * @param {Function} cb callback that is called when finished
 */
module.exports.warmUpNodes = (nodes, cb) =>
    times(
        nodes.length - 1,
        (n, cb) => nodes[n].dial(nodes[n + 1].peerInfo, cb),
        (err, _) => cb(err, nodes)
    )
