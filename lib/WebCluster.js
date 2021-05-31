"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebCluster = void 0;
const path = require("path");
const util = require("util");
const coroutine = require("coroutine");
const net = require("net");
const fs = require("fs");
const newWebServer_1 = require("./newWebServer");
const dateTime_1 = require("./dateTime");
const _worker = path.join(__dirname, 'WebCluster_worker.js');
/**
 * 多worker实现的WebServer
 */
class WebCluster {
    constructor(options) {
        delete options["mods"];
        let cfg = options;
        cfg.dir = cfg.dir || path.dirname(cfg.worker);
        this.cfg = cfg;
        this.svr_opts = newWebServer_1.getServerOpts(cfg);
        this.clusters = [];
        const self = this;
        self.on_exit = self.on_exit.bind(self);
        self.on_beforeExit = self.on_beforeExit.bind(self);
        self.on_SIGINT = self.on_SIGINT.bind(self);
        self.on_dispatch_events = self.on_dispatch_events.bind(self);
    }
    newWorker(j, onReady) {
        const self = this;
        const cfg = self.cfg;
        const worker = new coroutine.Worker(_worker);
        worker["@id"] = j;
        worker.onmessage = e => {
            if (util.isString(e.data)) {
                if (e.data === 'open') {
                    worker.postMessage(Object.assign({ fn: "init", i: j }, cfg));
                }
                else if (e.data === 'ready') {
                    onReady(j);
                }
                else if (e.data === "reload") {
                    self.reload();
                }
                else if (e.data === "close") {
                    self.stop();
                }
                else if (e.data == "run") {
                    self.start();
                }
                else if (e.data == "pause") {
                    self.pause();
                }
                else if (e.data == "reuse") {
                    self.reuse();
                }
            }
            else if (util.isObject(e.data)) {
                if (Number.isInteger(e.data.reward_to)) { //线程中转消息
                    self.clusters[e.data.reward_to].postMessage(e.data);
                }
                else if (e.data.fn == "edit_global" && e.data.key && e.data.value !== undefined) {
                    global[e.data.key] = e.data.value;
                }
                else if (e.data.fn == "dispatch_events") {
                    self.on_dispatch_events({ fromCid: worker["@id"], type: e.data.type, value: e.data.value });
                }
                else if (e.data.fn == "editServerInfo") {
                    self.edit(e.data.crossOrginHeaders, e.data.opts);
                }
                else if (e.data.fn == "editConsole") {
                    console.reset();
                    e.data.cfgs.forEach(t => {
                        console.add(t);
                    });
                    if (Number.isInteger(e.data.loglevel)) {
                        console.loglevel = e.data.loglevel;
                    }
                }
            }
        };
        return worker;
    }
    startClusters() {
        const self = this;
        self.clusters.length = 0;
        const countDownEvent = new coroutine.Event();
        const onReadys = [];
        const onReadyFn = (i) => {
            onReadys.push(i);
            if (onReadys.length == self.cfg.numbers) {
                countDownEvent.set();
            }
        };
        self.cluster = { index: -1, total: self.cfg.numbers };
        for (let j = 0; j < self.cfg.numbers; j++) {
            self.clusters.push(self.newWorker(j, onReadyFn));
        }
        countDownEvent.wait();
        self.post = self.post_real;
        if (self.cfg.globalKey && !global.hasOwnProperty(self.cfg.globalKey))
            global[self.cfg.globalKey] = self;
    }
    stopClusters() {
        const self = this;
        let clusters = self.clusters;
        self.post("@destory@");
        self.clusters.length = 0;
    }
    stop() {
        let self = this;
        self.stopClusters();
        self.socket.close();
        self.socket = null;
        self.runIng = false;
        process.off("exit", self.on_beforeExit);
        process.off("beforeExit", self.on_beforeExit);
        process.off("SIGINT", self.on_SIGINT);
        process.off("dispatch_events", self.on_dispatch_events);
        console.warn("WebCluster.stop");
        if (this.watcherList) {
            this.watcherList.forEach(e => e.close());
            this.watcherList.length = 0;
            clearTimeout(this.watch_file_delay_reload_timer);
        }
    }
    reload() {
        this.clusters.forEach(w => {
            w.postMessage({ fn: "reload" });
        });
    }
    autoReload(ttl) {
        ttl = ttl || 2000;
        if (ttl < 1) {
            return;
        }
        const self = this;
        coroutine.start(function () {
            while (self.runIng) {
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
        this.pauseIng = true;
    }
    reuse() {
        this.pauseIng = false;
    }
    accept(self, sock) {
        let idx = 0;
        while (self.runIng && self.socket === sock) {
            let con = sock.accept();
            if (self.pauseIng) {
                con.close();
                return;
            }
            if (idx >= self.cfg.numbers) {
                idx = 0;
            }
            self.clusters[idx++].postMessage(con);
        }
    }
    start() {
        const self = this;
        if (self.runIng === true) {
            throw new Error('server is already running!');
        }
        self.startClusters();
        const socket = self.socket = new net.Socket(Number.isInteger(parseInt(String(this.cfg.port))) ? net.AF_INET : net.AF_UNIX);
        const opts = self.cfg;
        try {
            socket.bind(opts.port);
            socket.listen(self.cfg.backlog);
            let idx = 0;
            self.runIng = true;
            coroutine.start(self.accept.bind(self), self, socket);
        }
        catch (error) {
            console.warn(error.message, error.stack);
            if (error.number !== 9) {
                throw error;
            }
        }
        process.on("exit", self.on_beforeExit);
        process.on("beforeExit", self.on_beforeExit);
        process.on("SIGINT", self.on_SIGINT);
        process.on("dispatch_events", self.on_dispatch_events);
        console.warn(dateTime_1.dateTimeStr(), "WebCluster.start", opts.port);
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
    edit(crossOriginHeaders, opts) {
        if (this.cfg.crossOriginHeaders != crossOriginHeaders || this.checkChangeAndApplyOpts(opts)) {
            this.cfg.crossOriginHeaders = crossOriginHeaders;
            this.cfg = Object.assign(Object.assign({}, this.cfg), this.svr_opts);
            this.post({ fn: "editServerInfo", crossOriginHeaders: this.cfg.crossOriginHeaders, opts: this.svr_opts });
        }
    }
    on_beforeExit(e) {
        this.post({ fn: "fn_event_process", type: "beforeExit", value: e });
        console.warn(dateTime_1.dateTimeStr(), "WebCluster.shutDown");
        this.pause();
    }
    on_exit(e) {
        this.post({ fn: "fn_event_process", type: "exit", value: e });
        this.stop();
    }
    on_SIGINT(e) {
        this.post({ fn: "fn_event_process", type: "SIGINT", value: e });
        this.reload();
        global.gc && global.gc();
    }
    on_dispatch_events(e) {
        if (e && e.key && e.value) {
            this.post({ fn: "dispatch_events", type: e.type, value: e.value }, e.fromCid);
        }
    }
    post(d, exceptId) {
    }
    post_real(d, exceptId) {
        this.clusters.forEach(w => {
            if (w["@id"] != exceptId) {
                w.postMessage(d);
            }
        });
    }
}
exports.WebCluster = WebCluster;
