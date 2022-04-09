import * as fetch from 'node-fetch';
import {AUTH_SCHEME, CALENDAR_PROVIDER} from './cdconfig';
import * as Google from './providers/google';
import * as Apple from './providers/apple';
import * as Microsoft from './providers/msft';

export const getScheme = (provider:CALENDAR_PROVIDER) => {
    switch(provider) {
        case CALENDAR_PROVIDER.Google:
            return AUTH_SCHEME.OAuth2;
        case CALENDAR_PROVIDER.Apple:
            return AUTH_SCHEME.Basic;
        case CALENDAR_PROVIDER.Microsoft:
            return AUTH_SCHEME.OAuth2;
    }
};

export const ProviderConfigs = {
    [CALENDAR_PROVIDER.Google]: Google.ProviderConfig,
    [CALENDAR_PROVIDER.Microsoft]: Microsoft.ProviderConfig,
    [CALENDAR_PROVIDER.Apple]: Apple.ProviderConfig
};

let discoveryDocuments = {
    [CALENDAR_PROVIDER.Google]: undefined,
    [CALENDAR_PROVIDER.Microsoft]: undefined,
};

export async function getDiscoveryDocument(provider:CALENDAR_PROVIDER):Promise<any> {
    if (discoveryDocuments[provider] === undefined) {
        const discoveryDocURL = ProviderConfigs[provider].discovery_doc_url;
        const response = await fetch(
            discoveryDocURL, {
                method: 'get'
            });
        discoveryDocuments[provider] = await response.json();
    }
    return discoveryDocuments[provider];
}

export async function get_OAuth_endpoint(provider:CALENDAR_PROVIDER, key:string):Promise<string> {
    const doc = await getDiscoveryDocument(provider);
    return doc[key];
}
