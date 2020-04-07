import * as path from "path";
import * as os from "os";
import * as util from "util";
import * as coroutine from "coroutine";
import * as net from "net";
import {dateTimeStr} from "./dateTime";

const defaultOptions = {
    port: 8000,
    worker: '',
    numbers: Math.max(1, os.cpuNumbers()-1),
    backlog:255,
    serverName:"nginx",
};
const _worker = path.join(__dirname, 'WebCluster_worker.js');

/**
 * 多worker实现的WebServer
 */
export class WebCluster{
    private opts:{worker:string, port:number, dir?:string, crossOriginHeaders?:string, serverName?:string,numbers?:number,backlog?:number,globalKey?:string};
    private runIng:boolean;
    private pauseIng:boolean;
    private clusters:Class_Worker[];
    private socket:Class_Socket;
    public cluster:{index:number,total:number};
    constructor(options:{worker:string, port:number, dir?:string, crossOriginHeaders?:string, serverName?:string,numbers?:number,backlog?:number,globalKey?:string}) {
        delete options["mods"];
        let opts = Object.assign({}, defaultOptions, options);
        opts.dir=opts.dir||path.dirname(opts.worker);
        this.opts=opts;
        this.clusters=[];

        const self = this;
        const countDownEvent = new coroutine.Event();
        const onReadys = [];
        const onReadyFn = (i:number)=>{
            onReadys.push(i);
            if(onReadys.length==opts.numbers){
                countDownEvent.set();
            }
        }
        self.cluster={index:-1,total:opts.numbers}
        for (let j = 0; j < opts.numbers; j++) {
            self.clusters.push(self.newWorker(j, onReadyFn));
        }
        countDownEvent.wait();
        self.post=self.post_real;

        self.on_exit=self.on_exit.bind(self);
        self.on_beforeExit=self.on_beforeExit.bind(self);
        self.on_SIGINT=self.on_SIGINT.bind(self);
        self.on_dispatch_events=self.on_dispatch_events.bind(self);
        if(opts.globalKey && !global.hasOwnProperty(opts.globalKey))global[opts.globalKey]=self;
    }
    private newWorker(j:number, onReady:(j:number)=>void){
        const self = this;
        const opts = self.opts;
        const worker = new coroutine.Worker(_worker);
        worker["@id"]=j;
        worker.onmessage = e => {
            if (util.isString(e.data)) {
                if (e.data === 'open') {
                    worker.postMessage({fn:"init", i:j, num:opts.numbers, file:opts.worker, dir:opts.dir, crossOriginHeaders:opts.crossOriginHeaders, serverName:opts.serverName, globalKey:opts.globalKey});
                }else if (e.data === 'ready') {
                    onReady(j);
                }else if(e.data === "reload") {
                    self.reload();
                }else if(e.data==="close"){
                    self.stop();
                }else if(e.data=="run"){
                    self.start();
                }else if(e.data=="pause"){
                    self.pause();
                }else if(e.data=="reuse"){
                    self.reuse();
                }
            }else if(util.isObject(e.data)){
                if(util.isNumber(e.data.reward_to)){//线程中转消息
                    self.clusters[e.data.reward_to].postMessage(e.data);
                }else if(e.data.fn=="edit_global" && e.data.key && e.data.value!==undefined){
                    global[e.data.key]=e.data.value;
                }else if(e.data.fn=="dispatch_events"){
                    self.on_dispatch_events({fromCid:worker["@id"],type:e.data.type,value:e.data.value});
                }else if(e.data.fn=="editServerInfo"){
                    self.edit(e.data.crossOrginHeaders,e.data.serverName);
                }else if(e.data.fn=="editConsole"){
                    console.reset();
                    e.data.cfgs.forEach(t=>{
                        console.add(t);
                    });
                }
            }
        };
        return worker;
    }
    public stop() {
        let self=this;
        self.socket.close();
        self.socket = null;
        self.runIng = false;
        (<any>process).off("exit",self.on_beforeExit);
        (<any>process).off("beforeExit",self.on_beforeExit);
        (<any>process).off("SIGINT",self.on_SIGINT);
        (<any>process).off("dispatch_events",self.on_dispatch_events);
        console.warn("WebCluster.stop");
    }
    public reload(){
        this.clusters.forEach(w=>{
            w.postMessage({fn:"reload"});
        });
    }
    public autoReload(ttl){
        ttl=ttl||2000;
        if(ttl<1){
            return;
        }
        const self = this;
        coroutine.start(function () {
            while(self.runIng){
                coroutine.sleep(ttl);
                self.reload();
            }
        })
    }
    public pause(){
        this.pauseIng=true;
    }
    public reuse(){
        this.pauseIng=false;
    }
    private accept(self:WebCluster, sock:Class_Socket){
        let idx=0;
        while(self.runIng && self.socket===sock){
            let con=sock.accept();
            if(self.pauseIng){
                con.close();
                return;
            }
            if (idx >= self.opts.numbers) {
                idx = 0;
            }
            self.clusters[idx++].postMessage(con);
        }
    }
    public start() {
        const self = this;
        if (self.runIng === true) {
            throw new Error('server is already running!');
        }
        const socket = self.socket = new net.Socket();;
        const opts = self.opts;
        try {
            socket.bind(opts.port);
            socket.listen(self.opts.backlog);
            let idx = 0;
            self.runIng = true;
            coroutine.start(self.accept.bind(self), self,socket);
        } catch (error) {
            console.warn(error.message,error.stack);
            if (error.number !== 9) {
                throw error;
            }
        }
        (<any>process).on("exit",self.on_beforeExit);
        (<any>process).on("beforeExit",self.on_beforeExit);
        (<any>process).on("SIGINT",self.on_SIGINT);
        (<any>process).on("dispatch_events",self.on_dispatch_events);
        console.warn(dateTimeStr(),"WebCluster.start",opts.port);
    }
    public edit(crossOrginHeaders:string,serverName?:string){
        serverName=serverName||defaultOptions.serverName;
        if(this.opts.crossOriginHeaders!=crossOrginHeaders || this.opts.serverName!=serverName){
            this.opts.crossOriginHeaders=crossOrginHeaders;
            this.opts.serverName=serverName;
            this.post({fn:"editServerInfo",crossOrginHeaders:crossOrginHeaders,serverName:serverName});
        }
    }
    private on_beforeExit(e){
        this.post({fn:"fn_event_process", type:"beforeExit", value:e});
        console.warn(dateTimeStr(),"WebCluster.shutDown");
        this.pause();
    }
    private on_exit(e){
        this.post({fn:"fn_event_process", type:"exit", value:e});
        this.stop();
    }
    private on_SIGINT(e){
        this.post({fn:"fn_event_process", type:"SIGINT", value:e});
        this.reload();
        global.gc && global.gc();
    }
    private on_dispatch_events(e){
        if(e && e.key && e.value){
            this.post({fn:"dispatch_events",type:e.type,value:e.value}, e.fromCid);
        }
    }
    private post(d:any, exceptId?:number){
    }
    private post_real(d:any, exceptId?:number){
        this.clusters.forEach(w=>{
            if(w["@id"]!=exceptId){
                w.postMessage(d);
            }
        });
    }
}