import { WebServerConfig } from "./newWebServer";
export declare class WebSimple {
    private port;
    private worker_file;
    private worker_dir;
    private svr_opts;
    private crossOriginHeaders;
    private sandboxMods;
    private sandboxGlobal;
    private svr;
    private opt_pause;
    private runIng;
    private logMore;
    private certs;
    constructor(opts: WebServerConfig);
    stop(): void;
    start(): void;
    private new_server;
    private new_handler;
    private checkChangeAndApplyOpts;
    edit(crossOrginHeaders: string, svr_opts?: {
        [index: string]: number | string;
    }): void;
    reload(): void;
    autoReload(ttl?: number): void;
    private watcherList;
    private watcherTtl;
    watchReload(dirs: string[], ttl?: number): void;
    private watch_file_delay_reload_timer;
    private onFileWatch;
    pause(): void;
    reuse(): void;
    private on_beforeExit;
    private on_exit;
    private on_SIGINT;
}
