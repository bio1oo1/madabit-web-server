console.log("Please confirm 'config.js - production : platform'");

var NodeUglifier = require("node-uglifier");
var nodeUglifier = new NodeUglifier("./server/index.js");

nodeUglifier.merge().uglify();
nodeUglifier.exportToFile("./build/server.min.js");
