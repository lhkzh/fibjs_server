"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/// <reference types="@fibjs/types" />
/// <reference path="../@types/index.d.ts" />
const path = require("path");
const http = require("http");
const vm = require("vm");
const coroutine = require("coroutine");
const fs = require("fs");
const newWebServer_1 = require("./newWebServer");
const dateTime_1 = require("./dateTime");
class WebSimple {
    constructor(opts) {
        this.port = opts.port || 8000;
        this.crossOriginHeaders = opts.crossOriginHeaders;
        this.svr_opts = newWebServer_1.getServerOpts(opts);
        this.worker_file = opts.worker;
        this.worker_dir = path.dirname(opts.worker);
        this.sandboxMods = opts.mods || {};
        this.sandboxGlobal = opts.global;
        this.logMore = opts.logMore || false;
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
        if (this.watcherList) {
            this.watcherList.forEach(e => e.close());
            this.watcherList.length = 0;
            clearTimeout(this.watch_file_delay_reload_timer);
        }
    }
    start() {
        if (this.svr != null) {
            return;
        }
        this.svr = new http.Server(this.port, this.new_handler());
        this.edit(this.crossOriginHeaders, this.svr_opts);
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
    checkChangeAndApplyOpts(opts) {
        let changed = false;
        if (opts) {
            for (let k in this.svr_opts) {
                if (opts.hasOwnProperty(k) && opts[k] && opts[k] != this.svr_opts[k]) {
                    changed = true;
                    this.svr_opts[k] = opts[k];
                }
            }
        }
        return changed;
    }
    edit(crossOrginHeaders, svr_opts) {
        this.crossOriginHeaders = crossOrginHeaders;
        this.checkChangeAndApplyOpts(svr_opts);
        if (!this.svr)
            return;
        if (svr_opts) {
            for (var [k, v] of Object.entries(this.svr_opts)) {
                this.svr[k] = v;
            }
        }
        if (this.crossOriginHeaders != null) {
            this.svr.enableCrossOrigin(this.crossOriginHeaders);
        }
    }
    reload() {
        let t = Date.now();
        try {
            this.svr.handler = this.new_handler();
        }
        catch (e) {
            console.error("WebSimple.reload", e);
        }
        if (this.logMore) {
            console.log("WebSimple.reload : %d ms", Date.now() - t);
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
    watchReload(dirs, ttl = 3000) {
        const self = this;
        self.watcherTtl = ttl;
        let watchs = self.watcherList = [];
        let watch_fn = self.onFileWatch.bind(self);
        dirs.forEach(e => {
            watchs.push(fs.watch(e, { recursive: true }, watch_fn));
        });
    }
    onFileWatch(e, k) {
        let self = this;
        if (self.watch_file_delay_reload_timer) {
            clearTimeout(self.watch_file_delay_reload_timer);
        }
        self.watch_file_delay_reload_timer = setTimeout(() => {
            self.watch_file_delay_reload_timer = null;
            if (self.runIng)
                self.reload();
        }, self.watcherTtl);
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
        console.warn(dateTime_1.dateTimeStr(), "WebSimple.shutDown");
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
