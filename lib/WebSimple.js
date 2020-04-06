"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/// <reference types="@fibjs/types" />
/// <reference path="../@types/index.d.ts" />
const dateTime_1 = require("./dateTime");
const path = require("path");
const http = require("http");
const vm = require("vm");
const coroutine = require("coroutine");
class WebSimple {
    constructor(opts) {
        this.port = opts.port || 8000;
        this.crossOriginHeaders = opts.crossOriginHeaders;
        this.serverName = opts.serverName || "nginx";
        this.worker_file = opts.worker;
        this.worker_dir = path.dirname(opts.worker);
        this.sandboxMods = opts.mods || {};
        this.sandboxGlobal = opts.global;
        this.on_exit = this.on_exit.bind(this);
        this.on_beforeExit = this.on_beforeExit.bind(this);
        this.on_SIGINT = this.on_SIGINT.bind(this);
        if (opts.globalKey && !global.hasOwnProperty(opts.globalKey))
            global[opts.globalKey] = this;
    }
    stop() {
        this.runIng = false;
        this.svr["stopSync"] ? this.svr["stopSync"]() : this.svr.stop();
        process.off("exit", this.on_beforeExit);
        process.off("beforeExit", this.on_beforeExit);
        process.off("SIGINT", this.on_SIGINT);
        console.warn("WebSimple.stop");
    }
    start() {
        if (this.svr != null) {
            return;
        }
        this.svr = new http.Server(this.port, this.new_handler());
        this.edit(this.crossOriginHeaders, this.serverName);
        this.svr.start ? this.svr.start() : this.svr["asyncRun"]();
        this.runIng = true;
        process.on("exit", this.on_beforeExit);
        process.on("beforeExit", this.on_beforeExit);
        process.on("SIGINT", this.on_SIGINT);
        console.warn(dateTime_1.dateTimeStr(), "WebSimple.start", this.port);
    }
    new_handler() {
        if (this.opt_pause) {
            return r => r.socket.close();
            // return r=>r.response.writeHead(403,'reject by pause')
        }
        var box = this.sandboxGlobal ? new vm.SandBox(this.sandboxMods, require, this.sandboxGlobal) : new vm.SandBox(this.sandboxMods, require);
        var dir = this.worker_dir;
        (this.sandboxGlobal || global)["vm_require"] = s => {
            // console.log(s);
            return box.require(s, dir);
        };
        return box.require(this.worker_file, dir);
    }
    edit(crossOrginHeaders, serverName) {
        this.crossOriginHeaders = crossOrginHeaders;
        this.serverName = serverName;
        if (!this.svr)
            return;
        this.svr.serverName = this.serverName;
        if (this.crossOriginHeaders != null) {
            this.svr.enableCrossOrigin(this.crossOriginHeaders);
        }
    }
    reload() {
        try {
            this.svr.handler = this.new_handler();
        }
        catch (e) {
            console.error("WebSimple|", e);
        }
    }
    autoReload(ttl = 2000) {
        if (ttl < 1)
            return;
        var self = this;
        coroutine.start(function () {
            while (self.svr != null && self.runIng) {
                coroutine.sleep(ttl);
                self.reload();
            }
        });
    }
    pause() {
        this.opt_pause = true;
        this.reload();
    }
    reuse() {
        this.opt_pause = false;
        this.reload();
    }
    on_beforeExit(e) {
        console.warn(dateTime_1.dateTimeStr(), "WebCluster.shutDown");
        this.pause();
    }
    on_exit(e) {
        this.stop();
    }
    on_SIGINT(e) {
        this.reload();
        global.gc && global.gc();
    }
}
exports.WebSimple = WebSimple;
