/// <reference types="@fibjs/types" />
/// <reference path="../@types/index.d.ts" />
import {dateTimeStr} from "./dateTime";
import * as path from "path";
import * as http from "http";
import * as vm from "vm";
import * as coroutine from "coroutine";

export class WebSimple{
    private port:number;
    private worker_file:string;
    private worker_dir:string;
    private crossOriginHeaders:string;
    private serverName:string;
    private sandboxMods:{[index:string]:any};
    private sandboxGlobal:any;
    private svr:Class_HttpServer;
    private opt_pause:boolean;
    private runIng:boolean;
    public constructor(opts:{worker:string, port:number, crossOriginHeaders?:string, serverName?:string, mods?:{[index:string]:any}, global?:any,globalKey?:string}){
        this.port=opts.port||8000;
        this.crossOriginHeaders=opts.crossOriginHeaders;
        this.serverName=opts.serverName||"nginx";
        this.worker_file=opts.worker;
        this.worker_dir=path.dirname(opts.worker);
        this.sandboxMods=opts.mods||{};
        this.sandboxGlobal=opts.global;
        this.on_exit=this.on_exit.bind(this);
        this.on_beforeExit=this.on_beforeExit.bind(this);
        this.on_SIGINT=this.on_SIGINT.bind(this);
        if(opts.globalKey && !global.hasOwnProperty(opts.globalKey))global[opts.globalKey]=this;
    }
    public stop(){
        this.runIng=false;
        this.svr["stopSync"]?this.svr["stopSync"]():this.svr.stop();
        (<any>process).off("exit",this.on_beforeExit);
        (<any>process).off("beforeExit",this.on_beforeExit);
        (<any>process).off("SIGINT",this.on_SIGINT);
        console.warn("WebSimple.stop");
    }
    public start(){
        if(this.svr!=null){
            return;
        }
        this.svr=new http.Server(this.port, this.new_handler());
        this.edit(this.crossOriginHeaders, this.serverName);
        this.svr.start ? this.svr.start():this.svr["asyncRun"]();
        this.runIng=true;
        (<any>process).on("exit",this.on_beforeExit);
        (<any>process).on("beforeExit",this.on_beforeExit);
        (<any>process).on("SIGINT",this.on_SIGINT);
        console.warn(dateTimeStr(),"WebSimple.start",this.port);
    }
    private new_handler() {
        if(this.opt_pause){
            return r=>r.socket.close();
            // return r=>r.response.writeHead(403,'reject by pause')
        }
        var box= this.sandboxGlobal ? new vm.SandBox(this.sandboxMods,require,this.sandboxGlobal):new vm.SandBox(this.sandboxMods,require);
        var dir= this.worker_dir;
        (this.sandboxGlobal||global)["vm_require"]=s=>{
            // console.log(s);
            return box.require(s, dir);
        };
        return box.require(this.worker_file, dir);
    }
    public edit(crossOrginHeaders:string,serverName?:string){
        this.crossOriginHeaders=crossOrginHeaders;
        this.serverName=serverName;
        if(!this.svr)return;
        this.svr.serverName=this.serverName;
        if(this.crossOriginHeaders!=null){
            this.svr.enableCrossOrigin(this.crossOriginHeaders);
        }
    }
    public reload(){
        try{
            this.svr.handler=this.new_handler();
        }catch (e) {
            console.error("WebSimple|",e);
        }
    }
    public autoReload(ttl:number=2000){
        if(ttl<1)return;
        var self=this;
        coroutine.start(function () {
            while(self.svr!=null && self.runIng){
                coroutine.sleep(ttl);
                self.reload();
            }
        })
    }
    public pause(){
        this.opt_pause=true;
        this.reload();
    }
    public reuse(){
        this.opt_pause=false;
        this.reload();
    }
    private on_beforeExit(e){
        console.warn(dateTimeStr(),"WebSimple.shutDown");
        this.pause();
    }
    private on_exit(e){
        this.stop();
    }
    private on_SIGINT(e){
        this.reload();
        global.gc && global.gc();
    }

}