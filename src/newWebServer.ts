import {WebCluster} from "./WebCluster";
import {WebSimple} from "./WebSimple";

export interface WebServer {
    cluster?: { index: number, total: number },
    start: () => void,
    stop: () => void,
    reload: () => void,
    autoReload: (ttl?: number) => void,
    watchReload: (dirs: string[], ttl_afterEventToReload?: number) => void,
    pause: () => void,
    reuse: () => void,
    edit: (crossOrginHeaders: string, svr_opts?: { [index: string]: number | string }) => void
}

export interface WebServerConfig {
    worker: string,
    port: number,
    crossOriginHeaders?: string,
    serverName?: string,
    maxBodySize?: number/**MB*/
    ,
    maxHeadersCount?: number,
    mods?: { [index: string]: any },
    global?: any,
    dir?: string,
    numbers?: number/**mult_thread*/
    ,
    backlog?: number,
    globalKey?: string,
    logMore?: boolean
}

export function getServerOpts(cfg: WebServerConfig, optsDefault = {
    serverName: "nginx",
    maxHeadersCount: 32,
    maxBodySize: 16
}): { [index: string]: number | string } {
    let opts = {...optsDefault};
    Object.keys(opts).forEach(k => {
        if (cfg[k] && typeof cfg[k] == typeof opts[k]) {
            opts[k] = cfg[k];
        }
    });
    return opts;
}

export function newWebServer(more: boolean, opts: WebServerConfig): WebServer {
    return more ? new WebCluster(opts) : new WebSimple(opts);
}