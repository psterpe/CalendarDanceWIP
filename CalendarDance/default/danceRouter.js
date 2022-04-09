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
const express = require("express");
const cdconfig_1 = require("./cdconfig");
const dal_1 = require("./dal");
const dance_1 = require("./dance");
exports.router = express.Router();
exports.router.use((req, res, next) => {
    if (req.url.startsWith('/s/')) {
        if (!req.session.userid) {
            res.status(403).send(new cdconfig_1.APIResponse(false, 'Unauthorized'));
            return;
        }
    }
    next();
});
exports.router.post('/s/initiate', (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    const sender = req.session.userid;
    const recipientEmail = req.body.recipientEmail;
    const recipientIUser = (yield dal_1.getUserByValue({ field: 'email', value: recipientEmail }));
    if (!recipientIUser) {
        res.status(500).send(new cdconfig_1.APIResponse(false, 'Unknown recipient'));
        return;
    }
    const tftoken = req.body.tftoken;
    const tfparams = req.body.tfparams;
    const shortSender = { userid: sender };
    const shortRecipient = { userid: recipientIUser.userid };
    const dance = new dance_1.Dance(shortSender, shortRecipient, 'now', shortRecipient, {
        state: cdconfig_1.DANCE_STATE.INITIATE,
        stateDate: new Date(),
        stateUser: sender,
        tftoken: tftoken,
        tfparams: tfparams
    }, undefined);
    yield dance.save();
    res.status(200).send(new cdconfig_1.APIResponse(true, ''));
}));
exports.router.get('/s/poll/:roles', (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    let dances = yield dal_1.getDances(req.session.userid, req.params.roles);
    dances = dances.filter((idance, idx) => idance.latestState !== cdconfig_1.DANCE_STATE.INITIATE);
    res.status(200).send(new cdconfig_1.APIResponse(true, dances));
}));
const updateDance = (userid, danceId, state, stateParams) => __awaiter(void 0, void 0, void 0, function* () {
    const idance = yield dal_1.getDance(danceId);
    if (idance === undefined) {
        return [false, 'No such dance'];
    }
    const dance = dance_1.Dance.fromDb(idance);
    let result;
    if (state === null || state === undefined) {
        dance.history[dance.latestStateIndex] = Object.assign(Object.assign({}, dance.history[dance.latestStateIndex]), stateParams);
        result = yield dance.save();
    }
    else {
        result = yield dance.addState(userid, danceId, state, stateParams);
    }
    return [result, ''];
});
exports.router.post('/s/accept', (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    const danceId = req.body.danceId;
    const [result, reason] = yield updateDance(req.session.userid, danceId, cdconfig_1.DANCE_STATE.ACCEPT, {});
    res.status(result ? 200 : 401).send(new cdconfig_1.APIResponse(result, reason));
}));
exports.router.post('/s/quit', (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    const danceId = req.body.danceId;
    const [result, reason] = yield updateDance(req.session.userid, danceId, cdconfig_1.DANCE_STATE.QUIT, {});
    res.status(result ? 200 : 401).send(new cdconfig_1.APIResponse(result, reason));
}));
exports.router.post('/s/snooze', (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    const danceId = req.body.danceId;
    const deferral = req.body.deferral[0];
    const [result, reason] = yield updateDance(req.session.userid, danceId, cdconfig_1.DANCE_STATE.SNOOZE, { deferral: deferral });
    res.status(result ? 200 : 401).send(new cdconfig_1.APIResponse(result, reason));
}));
exports.router.post('/s/negotiate', (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    const danceId = req.body.danceId;
    const proposal = req.body.proposal;
    const [result, reason] = yield updateDance(req.session.userid, danceId, cdconfig_1.DANCE_STATE.NEGOTIATE, { proposal: proposal });
    res.status(result ? 200 : 401).send(new cdconfig_1.APIResponse(result, reason));
}));
exports.router.post('/s/choose', (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    const danceId = req.body.danceId;
    const choices = req.body.alternative.map((s) => parseInt(s));
    const key = 'choices' + req.body.perspective.charAt(0).toUpperCase() + req.body.perspective.slice(1);
    let stateParams = {};
    stateParams[key] = choices;
    const [result, reason] = yield updateDance(req.session.userid, danceId, null, stateParams);
    res.status(result ? 200 : 401).send(new cdconfig_1.APIResponse(result, reason));
}));
//# sourceMappingURL=danceRouter.js.map