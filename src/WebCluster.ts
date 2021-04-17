import * as path from "path";
import * as os from "os";
import * as util from "util";
import * as coroutine from "coroutine";
import * as net from "net";
import * as fs from "fs";
import {getServerOpts, WebServerConfig} from "./newWebServer";
import {dateTimeStr} from "./dateTime";

const defaultOptions = {
    numbers: Math.max(1, os.cpuNumbers() - 1),
    backlog: 2048
};
const _worker = path.join(__dirname, 'WebCluster_worker.js');

/**
 * 多worker实现的WebServer
 */
export class WebCluster {
    private cfg: WebServerConfig;
    private svr_opts: { [index: string]: number | string };
    private runIng: boolean;
    private pauseIng: boolean;
    private clusters: Class_Worker[];
    private socket: Class_Socket;
    public cluster: { index: number, total: number };

    constructor(options: WebServerConfig) {
        delete options["mods"];
        let cfg: WebServerConfig = Object.assign({}, defaultOptions, options);
        cfg.dir = cfg.dir || path.dirname(cfg.worker);
        this.cfg = cfg;
        this.svr_opts = getServerOpts(cfg);
        this.clusters = [];

        const self = this;

        self.on_exit = self.on_exit.bind(self);
        self.on_beforeExit = self.on_beforeExit.bind(self);
        self.on_SIGINT = self.on_SIGINT.bind(self);
        self.on_dispatch_events = self.on_dispatch_events.bind(self);
    }

    private newWorker(j: number, onReady: (j: number) => void) {
        const self = this;
        const cfg = self.cfg;
        const worker = new coroutine.Worker(_worker);
        worker["@id"] = j;
        worker.onmessage = e => {
            if (util.isString(e.data)) {
                if (e.data === 'open') {
                    worker.postMessage({fn: "init", i: j, ...cfg});
                } else if (e.data === 'ready') {
                    onReady(j);
                } else if (e.data === "reload") {
                    self.reload();
                } else if (e.data === "close") {
                    self.stop();
                } else if (e.data == "run") {
                    self.start();
                } else if (e.data == "pause") {
                    self.pause();
                } else if (e.data == "reuse") {
                    self.reuse();
                }
            } else if (util.isObject(e.data)) {
                if (util.isNumber(e.data.reward_to)) {//线程中转消息
                    self.clusters[e.data.reward_to].postMessage(e.data);
                } else if (e.data.fn == "edit_global" && e.data.key && e.data.value !== undefined) {
                    global[e.data.key] = e.data.value;
                } else if (e.data.fn == "dispatch_events") {
                    self.on_dispatch_events({fromCid: worker["@id"], type: e.data.type, value: e.data.value});
                } else if (e.data.fn == "editServerInfo") {
                    self.edit(e.data.crossOrginHeaders, e.data.opts);
                } else if (e.data.fn == "editConsole") {
                    console.reset();
                    e.data.cfgs.forEach(t => {
                        console.add(t);
                    });
                    if (Number.isInteger(e.data.loglevel)) {
                        (<any>console).loglevel = <number>e.data.loglevel;
                    }
                }
            }
        };
        return worker;
    }

    private startClusters() {
        const self = this;
        self.clusters.length = 0;
        const countDownEvent = new coroutine.Event();
        const onReadys = [];
        const onReadyFn = (i: number) => {
            onReadys.push(i);
            if (onReadys.length == self.cfg.numbers) {
                countDownEvent.set();
            }
        }
        self.cluster = {index: -1, total: self.cfg.numbers}
        for (let j = 0; j < self.cfg.numbers; j++) {
            self.clusters.push(self.newWorker(j, onReadyFn));
        }
        countDownEvent.wait();
        self.post = self.post_real;
        if (self.cfg.globalKey && !global.hasOwnProperty(self.cfg.globalKey)) global[self.cfg.globalKey] = self;
    }

    private stopClusters() {
        const self = this;
        let clusters = self.clusters;
        self.post("@destory@");
        self.clusters.length = 0;
    }

    public stop() {
        let self = this;
        self.stopClusters();
        self.socket.close();
        self.socket = null;
        self.runIng = false;
        (<any>process).off("exit", self.on_beforeExit);
        (<any>process).off("beforeExit", self.on_beforeExit);
        (<any>process).off("SIGINT", self.on_SIGINT);
        (<any>process).off("dispatch_events", self.on_dispatch_events);
        console.warn("WebCluster.stop");
        if (this.watcherList) {
            this.watcherList.forEach(e => e.close());
            this.watcherList.length = 0;
            clearTimeout(this.watch_file_delay_reload_timer);
        }
    }

    public reload() {
        this.clusters.forEach(w => {
            w.postMessage({fn: "reload"});
        });
    }

    public autoReload(ttl) {
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
        })
    }

    private watcherList: Array<Class_FSWatcher>;
    private watcherTtl: number;

    public watchReload(dirs: string[], ttl = 3000) {
        const self = this;
        self.watcherTtl = ttl;
        let watchs = self.watcherList = [];
        let watch_fn = self.onFileWatch.bind(self);
        dirs.forEach(e => {
            watchs.push(fs.watch(e, {recursive: true}, watch_fn));
        });
    }

    private watch_file_delay_reload_timer: Class_Timer;

    private onFileWatch(e, k) {
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

    public pause() {
        this.pauseIng = true;
    }

    public reuse() {
        this.pauseIng = false;
    }

    private accept(self: WebCluster, sock: Class_Socket) {
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

    public start() {
        const self = this;
        if (self.runIng === true) {
            throw new Error('server is already running!');
        }
        self.startClusters();
        const socket = self.socket = new net.Socket();
        ;
        const opts = self.cfg;
        try {
            socket.bind(opts.port);
            socket.listen(self.cfg.backlog);
            let idx = 0;
            self.runIng = true;
            coroutine.start(self.accept.bind(self), self, socket);
        } catch (error) {
            console.warn(error.message, error.stack);
            if (error.number !== 9) {
                throw error;
            }
        }
        (<any>process).on("exit", self.on_beforeExit);
        (<any>process).on("beforeExit", self.on_beforeExit);
        (<any>process).on("SIGINT", self.on_SIGINT);
        (<any>process).on("dispatch_events", self.on_dispatch_events);
        console.warn(dateTimeStr(), "WebCluster.start", opts.port);
    }

    private checkChangeAndApplyOpts(opts?: { [index: string]: number | string }) {
        let changed = false;
        if (opts) {
            for (let k in this.svr_opts) {
                if (opts.hasOwnProperty(k) && opts[k] && opts[k] != this.svr_opts[k]) {
                    changed = true;
                    this.svr_opts[k] = opts[k];
                }
            }
        }
        return changed
    }

    public edit(crossOriginHeaders: string, opts?: { [index: string]: number | string }) {
        if (this.cfg.crossOriginHeaders != crossOriginHeaders || this.checkChangeAndApplyOpts(opts)) {
            this.cfg.crossOriginHeaders = crossOriginHeaders;
            this.cfg = {...this.cfg, ...this.svr_opts};
            this.post({fn: "editServerInfo", crossOriginHeaders: this.cfg.crossOriginHeaders, opts: this.svr_opts});
        }
    }

    private on_beforeExit(e) {
        this.post({fn: "fn_event_process", type: "beforeExit", value: e});
        console.warn(dateTimeStr(), "WebCluster.shutDown");
        this.pause();
    }

    private on_exit(e) {
        this.post({fn: "fn_event_process", type: "exit", value: e});
        this.stop();
    }

    private on_SIGINT(e) {
        this.post({fn: "fn_event_process", type: "SIGINT", value: e});
        this.reload();
        global.gc && global.gc();
    }

    private on_dispatch_events(e) {
        if (e && e.key && e.value) {
            this.post({fn: "dispatch_events", type: e.type, value: e.value}, e.fromCid);
        }
    }

    private post(d: any, exceptId?: number) {
    }

    private post_real(d: any, exceptId?: number) {
        this.clusters.forEach(w => {
            if (w["@id"] != exceptId) {
                w.postMessage(d);
            }
        });
    }
}