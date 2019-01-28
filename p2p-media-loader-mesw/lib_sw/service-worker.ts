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

/// <reference lib="webworker" />
/// <reference path="./declarations.d.ts" />

const VERSION = typeof(__P2PML_VERSION__) === "undefined" ? "__VERSION__" : __P2PML_VERSION__;
const ctx = (self as unknown as ServiceWorkerGlobalScope);
const p2pClients: Map<string, P2PClient> = new Map();

ctx.addEventListener("activate", event => {
    event.waitUntil(ctx.clients.claim().then(() => {
        ctx.clients.matchAll().then((clients) => {
            for (const client of clients) {
                const p2pClient = p2pClients.get(client.id);
                if (!p2pClient || p2pClient.active) {
                    continue;
                }

                p2pClient.active = true;
                p2pClient.port.postMessage({type: "ready", streamUrl: p2pClient.streamUrl, version: VERSION});
            }
        });
    }));
});

ctx.addEventListener("install", function(event) {
    event.waitUntil(ctx.skipWaiting());
});

ctx.addEventListener("fetch", async function(event: FetchEvent) {
    const p2pClient = p2pClients.get(event.clientId);
    if (!p2pClient) {
        return;
    }

    const url = event.request.url;

    if (!p2pClient.isUrlTracking(url)) {
        return;
    }

    p2pClient.port.postMessage({type: "fetch", url: url});

    event.waitUntil(new Promise<Response>((resolve, reject) => {
        p2pClient.createUrlRequest(url, resolve, reject);
    }));
});

ctx.addEventListener("message", event => {
    const eventType: string = event.data.type;

    switch (eventType) {
    case "init":
        processInitMessage(event);
        break;

    case "fetched":
        processFetchedMessage(event);
        break;
    }
});

async function processInitMessage(event: ExtendableMessageEvent) {
    const port = event.ports[0];
    const streamUrl: string = event.data.streamUrl;
    const isServiceWorkerActive: boolean = event.data.isServiceWorkerActive;
    const p2pClient = new P2PClient(streamUrl, isServiceWorkerActive, port);

    p2pClients.set((event.source as Client).id, p2pClient);

    if (p2pClient.active) {
        port.postMessage({type: "ready", streamUrl: streamUrl, version: VERSION});
    }

    // Remove disconnected clients
    const clients = await ctx.clients.matchAll();

    for (const [id, p2pClient] of p2pClients) {
        if (!p2pClient.active) {
            continue;
        }

        const client = clients.find(client => client.id === id);
        if (!client) {
            p2pClients.delete(id);
        }
    }
}

function processFetchedMessage(event: ExtendableMessageEvent) {
    const url: string = event.data.url;
    const manifestChildUrls: Set<string> | undefined = event.data.manifestChildUrls;

    const p2pClient = p2pClients.get((event.source as Client).id);
    if (!p2pClient) {
        return;
    }

    const urlRequest = p2pClient.getUrlRequest(url);

    if (!urlRequest) {
        return;
    }

    if (manifestChildUrls) {
        p2pClient.setManifest(url, manifestChildUrls);
    }

    const response: Response | undefined = event.data.response;

    if (response) {
        urlRequest.resolve(response);
    } else {
        urlRequest.reject(event.data.error);
    }
}

class RequestedUrlContext {
    constructor(
            public resolve: (result: Response) => void,
            public reject: (error?: any) => void) {}
}

class Manifest {
    public childUrls: Set<string> = new Set();
}

class P2PClient {
    private manifests: Map<string, Manifest> = new Map;
    public requestedUrls: Map<string, RequestedUrlContext> = new Map;

    constructor(
            readonly streamUrl: string,
            public active: boolean,
            readonly port: MessagePort) {
        this.manifests.set(streamUrl, new Manifest);
    }

    public createUrlRequest(url: string, resolve: typeof RequestedUrlContext.prototype.resolve, reject: typeof RequestedUrlContext.prototype.reject) {
        this.requestedUrls.set(url, new RequestedUrlContext(resolve, reject));
    }

    public getUrlRequest(url: string): RequestedUrlContext | undefined {
        return this.requestedUrls.get(url);
    }

    public setManifest(url: string, childUrls: Set<string>) {
        let manifest = this.manifests.get(url);

        if (!manifest) {
            manifest = new Manifest;
            this.manifests.set(url, manifest);
        }

        manifest.childUrls = childUrls;

        if (url === this.streamUrl) {
            for (const [url, ] of this.manifests) {
                if (url === this.streamUrl) {
                    continue;
                }

                if (!childUrls.has(url)) {
                    this.manifests.delete(url);
                }
            }
        }
    }

    public isUrlTracking(url: string,) {
        if (this.manifests.has(url)) {
            return true;
        }

        for (const [, manifest] of this.manifests) {
            if (manifest.childUrls.has(url)) {
                return true;
            }
        }

        return false;
    }

    public destroy() {
        for (const [, urlContext] of this.requestedUrls) {
            urlContext.reject(new Error("Client destroyed"));
        }
        this.requestedUrls.clear();
    }
}
