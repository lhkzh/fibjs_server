"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.KeyRequireFunction = exports.newWebServer = exports.getServerOpts = void 0;
const os = require("os");
const WebCluster_1 = require("./WebCluster");
const WebSimple_1 = require("./WebSimple");
function getServerOpts(cfg, optsDefault = {
    serverName: "nginx",
    maxHeadersCount: 32,
    maxBodySize: 16,
    backlog: 512
}) {
    let opts = Object.assign({}, optsDefault);
    Object.keys(opts).forEach(k => {
        if (cfg[k] && typeof cfg[k] == typeof opts[k]) {
            opts[k] = cfg[k];
        }
    });
    return opts;
}
exports.getServerOpts = getServerOpts;
function newWebServer(more, opts) {
    if (more && !(opts.numbers > 0)) {
        opts.numbers = Math.max(1, os.cpuNumbers() - 1);
    }
    return more ? new WebCluster_1.WebCluster(opts) : new WebSimple_1.WebSimple(opts);
}
exports.newWebServer = newWebServer;
exports.KeyRequireFunction = "$vm_require$";
