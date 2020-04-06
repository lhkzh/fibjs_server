"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const path = require("path");
const os = require("os");
const util = require("util");
const coroutine = require("coroutine");
const net = require("net");
const dateTime_1 = require("./dateTime");
const defaultOptions = {
    port: 8000,
    worker: '',
    numbers: Math.max(1, os.cpuNumbers() - 1),
    backlog: 255,
};
const _worker = path.join(__dirname, 'WebCluster_worker.js');
/**
 * 多worker实现的WebServer
 */
class WebCluster {
    constructor(options) {
        let opts = Object.assign({}, defaultOptions, options);
        opts.dir = opts.dir || path.dirname(opts.worker);
        this.opts = opts;
        this.clusters = [];
        const self = this;
        const countDownEvent = new coroutine.Event();
        const onReadys = [];
        const onReadyFn = (i) => {
            onReadys.push(i);
            if (onReadys.length == opts.numbers) {
                countDownEvent.set();
            }
        };
        self.cluster = { index: -1, total: opts.numbers };
        for (let j = 0; j < opts.numbers; j++) {
            self.clusters.push(self.newWorker(j, onReadyFn));
        }
        countDownEvent.wait();
        self.on_exit = self.on_exit.bind(self);
        self.on_beforeExit = self.on_beforeExit.bind(self);
        self.on_SIGINT = self.on_SIGINT.bind(self);
        self.on_dispatch_events = self.on_dispatch_events.bind(self);
        if (opts.globalKey && !global.hasOwnProperty(opts.globalKey))
            global[opts.globalKey] = self;
    }
    newWorker(j, onReady) {
        const self = this;
        const opts = self.opts;
        const worker = new coroutine.Worker(_worker);
        worker["@id"] = j;
        worker.onmessage = e => {
            if (util.isString(e.data)) {
                if (e.data === 'open') {
                    worker.postMessage({ fn: "init", i: j, num: opts.numbers, file: opts.worker, dir: opts.dir, crossOriginHeaders: opts.crossOriginHeaders, serverName: opts.serverName });
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
                if (util.isNumber(e.data.reward_to)) { //线程中转消息
                    self.clusters[e.data.reward_to].postMessage(e.data);
                }
                else if (e.data.fn == "edit_global" && e.data.key && e.data.value !== undefined) {
                    global[e.data.key] = e.data.value;
                }
                else if (e.data.fn == "dispatch_events") {
                    self.on_dispatch_events({ fromCid: worker["@id"], type: e.data.type, value: e.data.value });
                }
                else if (e.data.fn == "editServerInfo") {
                    self.edit(e.data.crossOrginHeaders, e.data.serverName);
                }
            }
        };
        return worker;
    }
    stop() {
        let self = this;
        self.socket.close();
        self.socket = null;
        self.runIng = false;
        process.off("exit", self.on_beforeExit);
        process.off("beforeExit", self.on_beforeExit);
        process.off("SIGINT", self.on_SIGINT);
        process.off("dispatch_events", self.on_dispatch_events);
        console.warn("WebCluster.stop");
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
            if (idx >= self.opts.numbers) {
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
        const socket = self.socket = new net.Socket();
        ;
        const opts = self.opts;
        try {
            socket.bind(opts.port);
            socket.listen(self.opts.backlog);
            let idx = 0;
            self.runIng = true;
            coroutine.start(self.accept.bind(self), socket);
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
    edit(crossOrginHeaders, serverName) {
        this.clusters.forEach(w => {
            w.postMessage({ fn: "editServerInfo", crossOrginHeaders: crossOrginHeaders, serverName: serverName });
        });
    }
    on_beforeExit(e) {
        this.clusters.forEach(w => {
            w.postMessage({ fn: "fn_event_process", type: "beforeExit", value: e });
        });
        console.warn(dateTime_1.dateTimeStr(), "WebCluster.shutDown");
        this.pause();
    }
    on_exit(e) {
        this.clusters.forEach(w => {
            w.postMessage({ fn: "fn_event_process", type: "exit", value: e });
        });
        this.stop();
    }
    on_SIGINT(e) {
        this.clusters.forEach(w => {
            w.postMessage({ fn: "fn_event_process", type: "SIGINT", value: e });
        });
        this.reload();
        global.gc && global.gc();
    }
    on_dispatch_events(e) {
        if (e && e.key && e.value) {
            this.clusters.forEach(w => {
                if (w["@id"] != e.fromCid) {
                    w.postMessage({ fn: "dispatch_events", type: e.type, value: e.value });
                }
            });
        }
    }
}
exports.WebCluster = WebCluster;
