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

import {Events, Segment as LoaderSegment, LoaderInterface} from "p2p-media-loader-core";

const defaultSettings: Settings = {
    swarmId: undefined,
};

export class SegmentManager {

    private readonly loader: LoaderInterface;
    private readonly settings: Settings;

    public constructor(loader: LoaderInterface, settings: any = {}) {
        this.settings = Object.assign(defaultSettings, settings);

        this.loader = loader;
        this.loader.on(Events.SegmentLoaded, this.onSegmentLoaded);
        this.loader.on(Events.SegmentError, this.onSegmentError);
        this.loader.on(Events.SegmentAbort, this.onSegmentAbort);
    }

    public destroy() {
        this.loader.destroy();
    }

    public getSettings() {
        return this.settings;
    }

    private onSegmentLoaded = (segment: LoaderSegment) => {
    }

    private onSegmentError = (segment: LoaderSegment, error: any) => {
    }

    private onSegmentAbort = (segment: LoaderSegment) => {
    }
}

interface Settings {
    /**
     * Override default swarm ID that is used to identify unique media stream with trackers (manifest URL without
     * query parameters is used as the swarm ID if the parameter is not specified)
     */
    swarmId: string | undefined;
}
