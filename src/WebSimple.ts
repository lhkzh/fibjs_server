import * as path from "path";
import * as http from "http";
import * as vm from "vm";
import * as coroutine from "coroutine";
import * as fs from "fs";
import {getServerOpts, KeyRequireFunction, WebServerConfig} from "./newWebServer";
import {dateTimeStr} from "./dateTime";

export class WebSimple {
    private port: number;
    private worker_file: string;
    private worker_dir: string;
    private svr_opts: { [index: string]: number | string };
    private crossOriginHeaders: string;
    private sandboxMods: { [index: string]: any };
    private sandboxGlobal: any;
    private svr: Class_HttpServer;
    private opt_pause: boolean;
    private runIng: boolean;
    private logMore: boolean;

    public constructor(opts: WebServerConfig) {
        this.port = opts.port || 8000;
        this.crossOriginHeaders = opts.crossOriginHeaders;
        this.svr_opts = getServerOpts(opts);
        this.worker_file = opts.worker;
        this.worker_dir = path.dirname(opts.worker);
        this.sandboxMods = opts.mods || {};
        this.sandboxGlobal = opts.global;
        this.logMore = opts.logMore || false;
        this.on_exit = this.on_exit.bind(this);
        this.on_beforeExit = this.on_beforeExit.bind(this);
        this.on_SIGINT = this.on_SIGINT.bind(this);
        if (opts.globalKey && !global.hasOwnProperty(opts.globalKey)) global[opts.globalKey] = this;
    }

    public stop() {
        this.runIng = false;
        this.svr["stopSync"] ? this.svr["stopSync"]() : this.svr.stop();
        (<any>process).off("exit", this.on_beforeExit);
        (<any>process).off("beforeExit", this.on_beforeExit);
        (<any>process).off("SIGINT", this.on_SIGINT);
        console.warn("WebSimple.stop");
        if (this.watcherList) {
            this.watcherList.forEach(e => e.close());
            this.watcherList.length = 0;
            clearTimeout(this.watch_file_delay_reload_timer);
        }
    }

    public start() {
        if (this.svr != null) {
            return;
        }
        this.svr = new http.Server(this.port, this.new_handler());
        this.edit(this.crossOriginHeaders, this.svr_opts);
        this.svr.start ? this.svr.start() : this.svr["asyncRun"]();
        this.runIng = true;
        (<any>process).on("exit", this.on_beforeExit);
        (<any>process).on("beforeExit", this.on_beforeExit);
        (<any>process).on("SIGINT", this.on_SIGINT);
        console.warn(dateTimeStr(), "WebSimple.start", this.port);
    }

    private new_handler() {
        if (this.opt_pause) {
            return r => r.socket.close();
            // return r=>r.response.writeHead(403,'reject by pause')
        }
        var box = this.sandboxGlobal ? new vm.SandBox(this.sandboxMods, require, this.sandboxGlobal) : new vm.SandBox(this.sandboxMods, require);
        var dir = this.worker_dir;
        (this.sandboxGlobal || global)[KeyRequireFunction] = s => {
            // console.log(s);
            return box.require(s, dir);
        };
        try{
            return box.require(this.worker_file, dir);
        }finally {
            delete (this.sandboxGlobal || global)[KeyRequireFunction];
        }
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

    public edit(crossOrginHeaders: string, svr_opts?: { [index: string]: number | string }) {
        this.crossOriginHeaders = crossOrginHeaders;
        this.checkChangeAndApplyOpts(svr_opts);
        if (!this.svr) return;
        if (svr_opts) {
            for (var [k, v] of Object.entries(this.svr_opts)) {
                this.svr[k] = v;
            }
        }
        if (this.crossOriginHeaders != null) {
            this.svr.enableCrossOrigin(this.crossOriginHeaders);
        }
    }

    public reload() {
        let t = Date.now();
        try {
            this.svr.handler = this.new_handler();
        } catch (e) {
            console.error("WebSimple.reload", e);
        }
        if (this.logMore) {
            console.log("WebSimple.reload : %d ms", Date.now() - t);
        }
    }

    public autoReload(ttl: number = 2000) {
        if (ttl < 1) return;
        var self = this;
        coroutine.start(function () {
            while (self.svr != null && self.runIng) {
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
        this.opt_pause = true;
        this.reload();
    }

    public reuse() {
        this.opt_pause = false;
        this.reload();
    }

    private on_beforeExit(e) {
        console.warn(dateTimeStr(), "WebSimple.shutDown");
        this.pause();
    }

    private on_exit(e) {
        this.stop();
    }

    private on_SIGINT(e) {
        this.reload();
        global.gc && global.gc();
    }

}