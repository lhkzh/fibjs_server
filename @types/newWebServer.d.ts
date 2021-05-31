/**
 * WebServer Api
 */
export interface WebServer {
    cluster?: {
        index: number;
        total: number;
    };
    start: () => void;
    stop: () => void;
    reload: () => void;
    autoReload: (ttl?: number) => void;
    watchReload: (dirs: string[], ttl_afterEventToReload?: number) => void;
    pause: () => void;
    reuse: () => void;
    edit: (crossOrginHeaders: string, svr_opts?: {
        [index: string]: number | string;
    }) => void;
}
/**
 * WebServer的配置项
 */
export interface WebServerConfig {
    worker: string;
    port?: number | string;
    crossOriginHeaders?: string;
    serverName?: string;
    maxBodySize?: number;
    maxHeadersCount?: number;
    mods?: {
        [index: string]: any;
    };
    global?: any;
    dir?: string;
    numbers?: number;
    backlog?: number;
    globalKey?: string;
    logMore?: boolean;
}
export declare function getServerOpts(cfg: WebServerConfig, optsDefault?: {
    serverName: string;
    maxHeadersCount: number;
    maxBodySize: number;
    backlog: number;
}): {
    [index: string]: number | string;
};
export declare function newWebServer(more: boolean, opts: WebServerConfig): WebServer;
export declare var KeyRequireFunction: string;
