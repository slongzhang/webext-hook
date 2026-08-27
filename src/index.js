import { nativeApis, createFnsRegistrar, isHookEnabled } from '~/utils/common';
import { XMLHttpRequestInterceptor } from '@mswjs/interceptors/XMLHttpRequest/web';
import { FetchInterceptor } from '@mswjs/interceptors/fetch/web';
import { WebSocketInterceptor } from '@mswjs/interceptors/WebSocket';

const main = function (appName) {
    const config = {};
    try {
        const xhr = new nativeApis.xhr();
        xhr.open(
            'GET',
            [
                location.origin.replace(/\/*$/, ''),
                '/__',
                ['crxext', 'init', 'by', appName].join('_'),
                '__',
            ].join(''),
            false,
        );
        xhr.send();
        Object.assign(
            config,
            Object.fromEntries(new URL(xhr.responseURL).searchParams),
        );
    } catch (_) {}

    // 解析判断适配

    const hook = { xhr: '1', fetch: '1', jsonDecode: '1', jsonEncode: '1' };
    const MAX_HISTORY_SIZE = 300;
    const handler = {
        nativeApis,
        history: null,
        ws: {
            connections: null,
        },
        on: {
            req: null,
            res: null,
            jsonDecode: null,
            jsonEncode: null,
            ws: {
                send: null,
                message: null,
            },
        },
    };

    if (isHookEnabled(hook.xhr) || isHookEnabled(hook.fetch)) {
        const reqFns = createFnsRegistrar();
        const onReq = async (engine, opts) => {
            for (let fn of reqFns.values()) {
                try {
                    let res = await fn(engine, opts);
                    if (res === false) {
                        break;
                    }
                } catch (_) {}
            }
        };
        const resFns = createFnsRegistrar();
        const onRes = async (engine, opts) => {
            for (let fn of resFns.values()) {
                try {
                    let res = await fn(engine, opts);
                    if (res === false) {
                        break;
                    }
                } catch (_) {}
            }
        };

        const history = [];
        const historyRecorder = function (engine, opts) {
            history.push({
                engine,
                request: opts.request,
                response: opts.response,
            });
            if (history.length > MAX_HISTORY_SIZE) {
                history.shift();
            }
        };
        resFns(historyRecorder);

        // 判断启用钩子
        if (isHookEnabled(hook.xhr)) {
            const interceptor = new XMLHttpRequestInterceptor();
            interceptor.apply();
            const engine = 'xhr';
            interceptor.on('request', (opts) => onReq(engine, opts));
            interceptor.on('response', (opts) => onRes(engine, opts));
        }

        if (isHookEnabled(hook.fetch)) {
            const interceptor = new FetchInterceptor();
            interceptor.apply();
            const engine = 'fetch';
            interceptor.on('request', (opts) => onReq(engine, opts));
            interceptor.on('response', (opts) => onRes(engine, opts));
        }

        handler.on.req = onReq;
        handler.on.res = onRes;
        handler.history = history;
    }

    // 开始WS钩子
    if (isHookEnabled(hook.ws)) {
        const sendFns = createFnsRegistrar();
        const messageFns = createFnsRegistrar();
        const connections = new Set();

        const interceptor = new WebSocketInterceptor();

        interceptor.apply();

        interceptor.on('connection', (connection) => {
            const ws = connection.client;

            connections.add(ws);

            connection.client.addEventListener('message', (event) => {
                for (let fn of messageFns.values()) {
                    try {
                        fn(ws, event.data, event);
                    } catch (_) {}
                }
            });

            connection.server.addEventListener('message', (event) => {
                for (let fn of sendFns.values()) {
                    try {
                        fn(ws, event.data, event);
                    } catch (_) {}
                }
            });

            connection.server.addEventListener('close', () => {
                connections.delete(ws);
            });
        });

        handler.ws.connections = connections;

        handler.on.ws = {
            send: sendFns,
            message: messageFns,
        };
    }

    // 开始JSON.parse钩子
    if (isHookEnabled(hook.jsonDecode)) {
        const hookFns = createFnsRegistrar();
        JSON.parse = function (...args) {
            let result = nativeApis.jsonDecode(...args);
            for (let fn of hookFns.values()) {
                let isErr = false,
                    err;
                try {
                    const hRes = fn(result, args);
                    if (isPlainObject(hRes)) {
                        let data = Object.hasOwn(hRes, 'data')
                            ? hRes.data
                            : result;
                        if (hRes.action === 'continue') {
                            result = data;
                        } else if (hRes.action === 'break') {
                            return data;
                        } else if (hRes.action === 'throw') {
                            isErr = true;
                            err = Object.hasOwn(hRes, 'data')
                                ? data
                                : new Error('hook throw');
                        }
                    }
                } catch (_) {}
                if (isErr) {
                    throw err;
                }
            }
            return result;
        };
        handler.on.jsonDecode = hookFns;
    }
    // 开始JSON.stringify钩子
    if (isHookEnabled(hook.jsonEncode)) {
        const hookFns = createFnsRegistrar();
        JSON.stringify = function (...args) {
            let result = nativeApis.jsonEncode(...args);
            for (let fn of hookFns.values()) {
                let isErr = false,
                    err;
                try {
                    const hRes = fn(result, args);
                    if (isPlainObject(hRes)) {
                        let data = Object.hasOwn(hRes, 'data')
                            ? hRes.data
                            : result;
                        if (hRes.action === 'continue') {
                            result = data;
                        } else if (hRes.action === 'break') {
                            return data;
                        } else if (hRes.action === 'throw') {
                            isErr = true;
                            err = Object.hasOwn(hRes, 'data')
                                ? data
                                : new Error('hook throw');
                        }
                    }
                } catch (_) {}
                if (isErr) {
                    throw err;
                }
            }
            return result;
        };
        handler.on.jsonEncode = hookFns;
    }
};

export default main();
