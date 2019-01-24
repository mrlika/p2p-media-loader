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
                if (!p2pClient || p2pClient.ready) {
                    continue;
                }

                p2pClient.ready = true;
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
    const urlContext = p2pClient.urlsToTrack.get(url);

    if (!urlContext) {
        return;
    }

    p2pClient.port.postMessage({type: "fetch", url: url});

    event.waitUntil(new Promise<Response>((resolve, reject) => {
        urlContext.resolve = resolve;
        urlContext.reject = reject;
    }));
});

ctx.addEventListener("message", async event => {
    switch (event.data.type) {
    case "init":
        const port = event.ports[0];
        const streamUrl = event.data.streamUrl;
        const p2pClient = new P2PClient(streamUrl, event.data.isServiceWorkerActive, port);

        p2pClients.set((event.source as Client).id, p2pClient);

        if (p2pClient.ready) {
            port.postMessage({type: "ready", streamUrl: streamUrl, version: VERSION});
        }

        // Remove disconnected clients
        const clients = await ctx.clients.matchAll();

        for (const [id, p2pClient] of p2pClients) {
            if (!p2pClient.ready) {
                continue;
            }

            const client = clients.find(client => client.id === id);
            if (!client) {
                p2pClients.delete(id);
            }
        }
        break;
    }
});

class UrlContext {
    constructor(
            public url: string,
            public resolve?: (result: {response?: Response, string}) => void,
            public reject?: (error?: any) => void) {}
}

class P2PClient {
    public urlsToTrack: Map<string, UrlContext> = new Map();

    constructor(
            readonly streamUrl: string,
            public ready: boolean,
            readonly port: MessagePort) {
        this.urlsToTrack.set(streamUrl, new UrlContext(streamUrl));
    }
}
