"use strict";
// see  https://github.com/fibjs-modules/cluster-server
Object.defineProperty(exports, "__esModule", { value: true });
const util = require("util");
const mq = require("mq");
const vm = require("vm");
if (!global["$cbks"]) {
    global["$cbks"] = {};
}
let clusterIndex; //当前第几个cluster
let clusterTotal; //一共多少个cluster
let httpHandler; //http监听器
let httpJsDir; //require时 js脚本目录
let httpJsFile; //主require的js文件
let httpCrossOriginHeaders; //跨域的http消息头支持
let httpServerName; //设置的http服务器名字
let globalKey;
if (!global.Master)
    global.Master = Master;
Master.onmessage = e => {
    if (util.isFunction(e.data.send)) { // e.data.toString()=="Socket"
        const con = e.data;
        mq.invoke(httpHandler, con, () => con.close());
    }
    else if (e.data.fn == "init") {
        init(e.data);
        Master.postMessage('ready');
    }
    else if (e.data.fn == "reload") {
        // httpHandler = new mq.HttpHandler(new_web_handler());
        // httpHandler.serverName="nginx";
        // if(httpCrossOriginHeaders){
        //     httpHandler.enableCrossOrigin(httpCrossOriginHeaders);
        // }
        try {
            httpHandler.handler = new_web_handler();
        }
        catch (e) {
            console.error("WebCluster_worker|", e);
        }
    }
    else if (e.data.fn == "editServerInfo") {
        editHttpHandler(e.data.crossOriginHeaders, e.data.serverName);
    }
    else if (e.data.fn == "cbk") {
        var fnWrap = global["$cbks"][e.data.i];
        if (fnWrap) {
            delete global["$cbks"][e.data.i];
            fnWrap.fn.apply(fnWrap.$, e.data.args);
        }
    }
    else if (e.data.fn == "fn_event_process") {
        process.emit(e.data.type, e.data.value);
    }
    else if (e.data.fn == "dispatch_events") {
        process.emit(e.data.type, e.data.value);
    }
};
function editHttpHandler(crossOriginHeaders, serverName) {
    httpServerName = serverName;
    httpCrossOriginHeaders = crossOriginHeaders;
    try {
        httpHandler = new mq.HttpHandler(new_web_handler());
        if (httpCrossOriginHeaders != null) {
            httpHandler.enableCrossOrigin(httpCrossOriginHeaders);
        }
        httpHandler.serverName = httpServerName;
    }
    catch (e) {
        console.error("WebCluster_worker|", e);
    }
}
function new_web_handler() {
    const box = new vm.SandBox({}, require);
    global["vm_require"] = function (s) {
        // console.log(s);
        return box.require(s, httpJsDir);
    };
    return box.require(httpJsFile, httpJsDir);
}
function init(data) {
    clusterIndex = data.i;
    clusterTotal = data.num;
    httpJsFile = data.file;
    httpJsDir = data.dir;
    globalKey = data.globalKey;
    global["$WebClusterInfo"] = { index: clusterIndex, total: clusterTotal };
    global["dispatch_events"] = (type, value) => {
        Master.postMessage({ fn: "dispatch_events", type: type, value: value });
        process.emit(type, value);
    };
    if (globalKey && !global.hasOwnProperty(globalKey))
        global[globalKey] = {
            cluster: { index: clusterIndex, total: clusterTotal },
            close: () => Master.postMessage("close"),
            run: () => Master.postMessage("run"),
            reload: () => Master.postMessage("reload"),
            autoReload: (t = 10000) => { },
            pause: () => Master.postMessage("pause"),
            reuse: () => Master.postMessage("reuse"),
            edit: (crossOrginHeaders, serverName) => {
                Master.postMessage({ fn: "editServerInfo", crossOrginHeaders: crossOrginHeaders, serverName: serverName });
            }
        };
    editHttpHandler(data.crossOriginHeaders, data.serverName);
}
Master.postMessage('open');
