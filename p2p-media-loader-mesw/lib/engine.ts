/**
 * Copyright 2019 Novage LLC.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {EventEmitter} from "events";
import {Events, LoaderInterface, HybridLoader} from "p2p-media-loader-core";
import {SegmentManager} from "./segment-manager";

export class Engine extends EventEmitter {

    public static isSupported(): boolean {
        return HybridLoader.isSupported() && ("serviceWorker" in navigator);
    }

    private readonly loader: LoaderInterface;
    private readonly segmentManager: SegmentManager;
    private messageChannel?: MessageChannel;
    private initPromiseResolve?: () => void;
    private initPromiseReject?: (error: Error) => void;

    public constructor(settings: any = {}) {
        super();

        this.loader = new HybridLoader(settings.loader);
        this.segmentManager = new SegmentManager(this.loader, settings.segments);

        Object.keys(Events)
            .map(eventKey => Events[eventKey as any])
            .forEach(event => this.loader.on(event, (...args: any[]) => this.emit(event, ...args)));
    }

    public destroy() {
        this.loader.destroy();
        this.segmentManager.destroy();
        this.rejectInitPromise("Canceled by destroy call");
    }

    public getSettings(): any {
        return {
            segments: this.segmentManager.getSettings(),
            loader: this.loader.getSettings()
        };
    }

    public getDetails(): any {
        return {
            loader: this.loader.getDetails()
        };
    }

    public init(mediaElement: HTMLMediaElement, streamUrl: string, serviceWorker: ServiceWorker, isServiceWorkerActive: boolean): Promise<void> {
        this.rejectInitPromise("Canceled by subsequent init call");

        this.messageChannel = new MessageChannel();
        this.messageChannel.port1.onmessage = this.onMessage;

        serviceWorker.postMessage({type: "init", streamUrl, isServiceWorkerActive}, [this.messageChannel.port2]);

        return new Promise<void>((resolve, reject) => {
            this.initPromiseResolve = resolve;
            this.initPromiseReject = reject;
        });
    }

    private onMessage = (event: MessageEvent) => {
        switch (event.data.type) {
        case "ready":
            this.onServiceWorkerReady();
            break;

        case "fetch":
            this.onServiceWorkerFetch(event.data.url);
            break;
        }
    }

    private onServiceWorkerReady() {
        if (this.initPromiseResolve) {
            this.initPromiseResolve();
            this.initPromiseResolve = undefined;
            this.initPromiseReject = undefined;
        }
    }

    private onServiceWorkerFetch(url: string) {
        console.log(`fetch ${url}`);
        const div = document.createElement("div");
        div.innerHTML = url;
        document.body.appendChild(div);
    }

    private rejectInitPromise(errorMessage: string) {
        if (this.initPromiseReject) {
            this.initPromiseReject(new Error(errorMessage));
            this.initPromiseReject = undefined;
            this.initPromiseResolve = undefined;
            this.messageChannel = undefined;
        }
    }
}
