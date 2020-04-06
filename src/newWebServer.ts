/// <reference types="@fibjs/types" />
/// <reference path="../@types/index.d.ts" />
import {WebCluster} from "./WebCluster";
import {WebSimple} from "./WebSimple";

export interface WebServer {
    cluster?:{index:number,total:number},
    start:()=>void,
    stop:()=>void,
    reload:()=>void,
    autoReload:(ttl?:number)=>void,
    pause:()=>void,
    reuse:()=>void,
    edit:(crossOrginHeaders:string, serverName?:string)=>void
}

export interface WebServerConfig {
    worker:string, port:number, crossOriginHeaders?:string, serverName?:string,
    mods?:{[index:string]:any}, global?:any,
    dir?:string,numbers?:number,backlog?:number,
    globalKey?:string
}

export function newWebServer(more:boolean, opts:WebServerConfig):WebServer {
    return more ? new WebCluster(opts):new WebSimple(opts);
}