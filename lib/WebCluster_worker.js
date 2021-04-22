"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
const util = require("util");
const mq = require("mq");
const vm = require("vm");
const newWebServer_1 = require("./newWebServer");
const Key_CallBacks = "$WebCluster_worker_cbks";
if (!global[Key_CallBacks]) {
    global[Key_CallBacks] = {};
}
let clusterIndex; //当前第几个cluster
let clusterTotal; //一共多少个cluster
let httpHandler; //http监听器
let httpJsDir; //require时 js脚本目录
let httpJsFile; //主require的js文件
let httpCrossOriginHeaders; //跨域的http消息头支持
let httpServerOpts; //设置的http服务器属性
let globalKey;
let logMore;
if (!global.Master)
    global.Master = Master;
Master.onmessage = e => {
    if (util.isFunction(e.data.send)) { // e.data.toString()=="Socket"
        const con = e.data;
        mq.invoke(httpHandler, con, () => con.close());
    }
    else if (e.data == "@destory@") {
        global["@DESTORYED"] = true;
        const ems = process;
        ems.emit("beforeExit", -1);
        ems.emit("exit", -1);
        ems.removeAllListeners(ems.eventNames());
        Master.onmessage = e => {
        };
        Master.postMessage = e => {
        };
    }
    else if (e.data.fn == "init") {
        init(e.data);
        Master.postMessage('ready');
    }
    else if (e.data.fn == "reload") {





        let t = Date.now();
        try {
            httpHandler.handler = new_web_handler();
        }
        catch (e) {
            console.error("WebCluster_worker.reload", e);
        }
        if (logMore) {
            console.log("WebCluster_worker.reload : %d ms", Date.now() - t);
        }
    }
    else if (e.data.fn == "editServerInfo") {
        editHttpHandler(e.data.crossOriginHeaders, e.data.opts);
    }
    else if (e.data.fn == "cbk") {
        var fnWrap = global[Key_CallBacks][e.data.i];
        if (fnWrap) {
            delete global[Key_CallBacks][e.data.i];
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
function editHttpHandler(crossOriginHeaders, svr_opts) {
    httpCrossOriginHeaders = crossOriginHeaders;
    try {
        httpHandler = new mq.HttpHandler(new_web_handler());
        if (httpCrossOriginHeaders != null) {
            httpHandler.enableCrossOrigin(httpCrossOriginHeaders);
        }
        if (svr_opts) {
            for (var [k, v] of Object.entries(svr_opts)) {
                if (util.isNumber(v) || util.isString(v)) {
                    httpHandler[k] = v;
                }
            }
        }
    }
    catch (e) {
        console.error("WebCluster_worker|edit_" + clusterIndex, e);
    }
}
function new_web_handler() {
    const box = new vm.SandBox({}, require);
    global[newWebServer_1.KeyRequireFunction] = function (s) {

        return box.require(s, httpJsDir);
    };
    try {
        return box.require(httpJsFile, httpJsDir);
    }
    finally {
        delete global[newWebServer_1.KeyRequireFunction];
    }
}
function init(data) {
    clusterIndex = data.i;
    clusterTotal = data.numbers;
    httpJsFile = data.worker;
    httpJsDir = data.dir;
    httpServerOpts = newWebServer_1.getServerOpts(data);
    globalKey = data.globalKey;
    logMore = data.logMore || false;
    global["$WebClusterInfo"] = { index: clusterIndex, total: clusterTotal };
    global["dispatch_events"] = (type, value) => {
        Master.postMessage({ fn: "dispatch_events", type: type, value: value });
        process.emit(type, value);
    };
    if (globalKey && !global.hasOwnProperty(globalKey)) {
        global[globalKey] = {
            cluster: { index: clusterIndex, total: clusterTotal },
            close: () => Master.postMessage("close"),
            run: () => Master.postMessage("run"),
            reload: () => Master.postMessage("reload"),
            autoReload: (t = 10000) => {
            },
            pause: () => Master.postMessage("pause"),
            reuse: () => Master.postMessage("reuse"),
            edit: (crossOriginHeaders, svr_opts) => {
                Master.postMessage({ fn: "editServerInfo", crossOriginHeaders: crossOriginHeaders, opts: svr_opts });
            }
        };
    }
    editHttpHandler(data.crossOriginHeaders, httpServerOpts);
}
Master.postMessage('open');
