import * as os from "os";
import {WebCluster} from "./WebCluster";
import {WebSimple} from "./WebSimple";

/**
 * WebServer Api
 */
export interface WebServer {
    cluster?: { index: number, total: number },
    //启动
    start: () => void,
    //停止
    stop: () => void,
    //重新载入脚本路由
    reload: () => void,
    //定时重新载入脚本路由
    autoReload: (ttl?: number) => void,
    //观察文件变化后重新载入脚本路由
    watchReload: (dirs: string[], ttl_afterEventToReload?: number) => void,
    //暂停客户端请求接入
    pause: () => void,
    //恢复客户端请求接入
    reuse: () => void,
    //修改一些配置
    edit: (crossOrginHeaders: string, svr_opts?: { [index: string]: number | string }) => void
}

/**
 * WebServer的配置项
 */
export interface WebServerConfig {
    //载入路由的js文件路径
    worker: string,
    //http服务器端口or UnixDomainPath
    port?: number|string,
    //跨域-响应头
    crossOriginHeaders?: string,
    //服务器的响应头server的值，默认nginx
    serverName?: string,
    //允许的最大post数据大小MB
    maxBodySize?: number,
    //允许消息头最大有多少个header项
    maxHeadersCount?: number,
    mods?: { [index: string]: any },
    global?: any,
    dir?: string,
    //多worker时开启几个mult_thread
    numbers?: number,
    backlog?: number,
    //在global上绑定的server变量名，会global[$globalKey]=newWebServerObj()
    globalKey?: string,
    //输出更多的日志
    logMore?: boolean
}

export function getServerOpts(cfg: WebServerConfig, optsDefault = {
    serverName: "nginx",
    maxHeadersCount: 32,
    maxBodySize: 16,
    backlog: 512
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
    if(more && !(opts.numbers>0)){
        opts.numbers = Math.max(1, os.cpuNumbers() - 1);
    }
    return more ? new WebCluster(opts) : new WebSimple(opts);
}

export var KeyRequireFunction = "$vm_require$";