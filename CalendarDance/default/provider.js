"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const fetch = require("node-fetch");
const cdconfig_1 = require("./cdconfig");
const Google = require("./providers/google");
const Apple = require("./providers/apple");
const Microsoft = require("./providers/msft");
exports.getScheme = (provider) => {
    switch (provider) {
        case cdconfig_1.CALENDAR_PROVIDER.Google:
            return cdconfig_1.AUTH_SCHEME.OAuth2;
        case cdconfig_1.CALENDAR_PROVIDER.Apple:
            return cdconfig_1.AUTH_SCHEME.Basic;
        case cdconfig_1.CALENDAR_PROVIDER.Microsoft:
            return cdconfig_1.AUTH_SCHEME.OAuth2;
    }
};
exports.ProviderConfigs = {
    [cdconfig_1.CALENDAR_PROVIDER.Google]: Google.ProviderConfig,
    [cdconfig_1.CALENDAR_PROVIDER.Microsoft]: Microsoft.ProviderConfig,
    [cdconfig_1.CALENDAR_PROVIDER.Apple]: Apple.ProviderConfig
};
let discoveryDocuments = {
    [cdconfig_1.CALENDAR_PROVIDER.Google]: undefined,
    [cdconfig_1.CALENDAR_PROVIDER.Microsoft]: undefined,
};
function getDiscoveryDocument(provider) {
    return __awaiter(this, void 0, void 0, function* () {
        if (discoveryDocuments[provider] === undefined) {
            const discoveryDocURL = exports.ProviderConfigs[provider].discovery_doc_url;
            const response = yield fetch(discoveryDocURL, {
                method: 'get'
            });
            discoveryDocuments[provider] = yield response.json();
        }
        return discoveryDocuments[provider];
    });
}
exports.getDiscoveryDocument = getDiscoveryDocument;
function get_OAuth_endpoint(provider, key) {
    return __awaiter(this, void 0, void 0, function* () {
        const doc = yield getDiscoveryDocument(provider);
        return doc[key];
    });
}
exports.get_OAuth_endpoint = get_OAuth_endpoint;
//# sourceMappingURL=provider.js.map