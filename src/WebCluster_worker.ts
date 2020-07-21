// see  https://github.com/fibjs-modules/cluster-server

import * as util from "util";
import * as mq from "mq";
import * as vm from "vm";
import {getServerOpts, WebServerConfig} from "./newWebServer";

if(!global["$cbks"]){
    global["$cbks"]={};
}
let clusterIndex:number;//当前第几个cluster
let clusterTotal:number;//一共多少个cluster
let httpHandler:Class_HttpHandler;//http监听器
let httpJsDir:string;//require时 js脚本目录
let httpJsFile:string;//主require的js文件
let httpCrossOriginHeaders:string;//跨域的http消息头支持
let httpServerOpts:{[index:string]:number|string};//设置的http服务器属性
let globalKey:string;
let logMore:boolean;
if(!global.Master)global.Master=Master;
Master.onmessage = e => {
    if (util.isFunction(e.data.send)) { // e.data.toString()=="Socket"
        const con = e.data;
        mq.invoke(httpHandler, con, () => con.close() );
    }else if(e.data=="@destory@"){
        global["@DESTORYED"]=true;
        const ems = <Class_EventEmitter><any>process;
        ems.emit("beforeExit",-1);
        ems.emit("exit",-1);
        ems.removeAllListeners(ems.eventNames());
        Master.onmessage=e=>{};
        Master.postMessage=e=>{};
    }else if(e.data.fn=="init"){
        init(e.data);
        Master.postMessage('ready');
    }else if(e.data.fn=="reload"){
        // httpHandler = new mq.HttpHandler(new_web_handler());
        // httpHandler.serverName="nginx";
        // if(httpCrossOriginHeaders){
        //     httpHandler.enableCrossOrigin(httpCrossOriginHeaders);
        // }
        let t = Date.now();
        try{
            httpHandler.handler=new_web_handler();
        }catch (e) {
            console.error("WebCluster_worker.reload",e);
        }
        if(this.logMore){
            console.log("WebCluster_worker.reload : %d ms",Date.now()-t);
        }
    }else if(e.data.fn=="editServerInfo"){
        editHttpHandler(e.data.crossOriginHeaders, e.data.opts);
    }else if(e.data.fn=="cbk"){
        var fnWrap=global["$cbks"][e.data.i];
        if(fnWrap){
            delete global["$cbks"][e.data.i];
            fnWrap.fn.apply(fnWrap.$, e.data.args);
        }
    }else if(e.data.fn=="fn_event_process"){
        (<any>process).emit(e.data.type,e.data.value);
    }else if(e.data.fn=="dispatch_events"){
        (<any>process).emit(e.data.type,e.data.value);
    }
};
function editHttpHandler(crossOriginHeaders:string, svr_opts:{[index:string]:number|string}) {
    httpCrossOriginHeaders = crossOriginHeaders;
    try{
        httpHandler = new mq.HttpHandler(new_web_handler());
        if(httpCrossOriginHeaders!=null) {
            httpHandler.enableCrossOrigin(httpCrossOriginHeaders);
        }
        if(svr_opts){
            for(var [k,v] of Object.entries(svr_opts)){
                if(util.isNumber(v)||util.isString(v)){
                    httpHandler[k]=v;
                }
            }
        }
    }catch (e) {
        console.error("WebCluster_worker|",e);
    }
}
function new_web_handler() {
    const box= new vm.SandBox({},require);
    global["vm_require"]=function(s){
        // console.log(s);
        return box.require(s, httpJsDir);
    };
    return box.require(httpJsFile, httpJsDir);
}
function init(data:WebServerConfig&{i:number}){
    clusterIndex=data.i;
    clusterTotal=data.numbers;
    httpJsFile=data.worker;
    httpJsDir=data.dir;
    httpServerOpts=getServerOpts(data);
    globalKey=data.globalKey;
    logMore=data.logMore||false;
    global["$WebClusterInfo"]={index:clusterIndex,total:clusterTotal};
    global["dispatch_events"]=(type,value)=>{
        Master.postMessage({fn:"dispatch_events",type:type,value:value});
        (<any>process).emit(type,value);
    }
    if(globalKey && !global.hasOwnProperty(globalKey))global[globalKey]={
        cluster:{index:clusterIndex,total:clusterTotal},
        close:()=>Master.postMessage("close"),
        run:()=>Master.postMessage("run"),
        reload:()=>Master.postMessage("reload"),
        autoReload:(t:number=10000)=>{},
        pause:()=>Master.postMessage("pause"),
        reuse:()=>Master.postMessage("reuse"),
        edit:(crossOriginHeaders:string, svr_opts?:{[index:string]:number|string})=>{
            Master.postMessage({fn:"editServerInfo",crossOriginHeaders:crossOriginHeaders,opts:svr_opts});
        }
    }
    editHttpHandler(data.crossOriginHeaders, httpServerOpts);
}
Master.postMessage('open');