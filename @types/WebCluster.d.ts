import { WebServerConfig } from "./newWebServer";
/**
 * 多worker实现的WebServer
 */
export declare class WebCluster {
    private cfg;
    private svr_opts;
    private runIng;
    private pauseIng;
    private clusters;
    private socket;
    cluster: {
        index: number;
        total: number;
    };
    constructor(options: WebServerConfig);
    private newWorker;
    private startClusters;
    private stopClusters;
    stop(): void;
    reload(): void;
    autoReload(ttl: any): void;
    private watcherList;
    private watcherTtl;
    watchReload(dirs: string[], ttl?: number): void;
    private watch_file_delay_reload_timer;
    private onFileWatch;
    pause(): void;
    reuse(): void;
    private accept;
    start(): void;
    private checkChangeAndApplyOpts;
    edit(crossOriginHeaders: string, opts?: {
        [index: string]: number | string;
    }): void;
    private on_beforeExit;
    private on_exit;
    private on_SIGINT;
    private on_dispatch_events;
    private post;
    private post_real;
}
