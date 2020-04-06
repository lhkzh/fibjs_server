"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/// <reference types="@fibjs/types" />
/// <reference path="../@types/index.d.ts" />
const WebCluster_1 = require("./WebCluster");
const WebSimple_1 = require("./WebSimple");
function newWebServer(more, opts) {
    return more ? new WebCluster_1.WebCluster(opts) : new WebSimple_1.WebSimple(opts);
}
exports.newWebServer = newWebServer;
