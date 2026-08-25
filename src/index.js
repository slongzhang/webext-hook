import { createFnsRegistrar } from './utils/common';
import { hookXhr, unHookXhr } from './mod/xhr';

/**
 * ============================================================
 * XHR Hook Manager
 *
 * 当前只负责：
 *   - XHR
 *
 * 暂不处理：
 *   - fetch
 *   - Request
 *   - JSON.parse
 *   - JSON.stringify
 *
 * 核心原则：
 *
 *   Hook 层：
 *      只负责捕获 XHR
 *
 *   onReq / onRes：
 *      负责判断目标接口
 *      负责决定是否修改
 *      负责决定是否阻止
 *
 * Hook 本身不包含任何业务 URL 判断。
 * ============================================================
 */
(() => {
    const APP_NAME = 'slogext';

    /**
     * ========================================================
     * Hook 控制结果
     * ========================================================
     *
     * undefined
     *     不处理
     *
     * 普通值
     *     使用返回值作为修改后的数据
     *
     * HOOK.BLOCK
     *     阻止
     */
    const SIGNAL = Object.freeze({
        BLOCK: Symbol(`${APP_NAME}:HOOK_BLOCK`),
    });

    /**
     * ========================================================
     * 原始 API 快照
     * ========================================================
     *
     * 必须在 Hook 前保存。
     */
    const originApi = {
        xhr: window.XMLHttpRequest,
    };

    const HookConfig = {
      xhr: '1',
      fetch: '1',
    };
    /**
     * ========================================================
     * Hook Handler
     * ========================================================
     */
    const hookHandler = {
        originApi,
        SIGNAL,
        /**
         * 请求处理器
         */
        onReq: null,

        /**
         * 响应处理器
         */
        onRes: null,

    };

    /**
     * ========================================================
     * 判断是否 Async Function
     * ========================================================
     *
     * 这里用于同步 XHR：
     *
     *   async function xxx() {}
     *
     * 这种注册函数在同步 XHR 中直接跳过，
     * 连函数本身都不调用。
     *
     * 注意：
     *
     *   function xxx() {
     *       return Promise.resolve(...);
     *   }
     *
     * 这种普通函数无法在调用之前可靠判断其是否返回 Promise，
     * 所以只能调用后发现 Promise，再放弃结果。
     *
     * 因此推荐同步 XHR 的 Hook 使用普通同步函数。
     */
    const isAsyncFunction = (fn) => {
        if (typeof fn !== 'function') {
            return false;
        }

        return fn.constructor?.name === 'AsyncFunction';
    };

    /**
     * ========================================================
     * 判断 Promise
     * ========================================================
     */
    const isPromiseLike = (value) => {
        return (
            value !== null &&
            (
                typeof value === 'object' ||
                typeof value === 'function'
            ) &&
            typeof value.then === 'function'
        );
    };

    /**
     * ========================================================
     * 同步 Hook 执行器
     * ========================================================
     *
     * 专门用于：
     *
     *   - 同步 XHR
     *
     * 规则：
     *
     *   undefined
     *       不处理
     *
     *   普通返回值
     *       修改当前数据
     *
     *   HOOK.BLOCK
     *       阻止
     *
     *   async function
     *       直接跳过，不调用
     *
     *   普通 function 返回 Promise
     *       不等待，放弃本次处理
     *
     * 绝对不会 await。
     */
    const runSyncHookHandlers = (registrar, value) => {
        let current = value;

        for (const fn of registrar) {
            /**
             * 同步 XHR 下：
             *
             * async function 直接跳过。
             *
             * 这样可以保证：
             *
             *   同步 XHR
             *       ↓
             *   不会执行异步 Hook
             *       ↓
             *   不会改变同步语义
             */
            if (isAsyncFunction(fn)) {
                continue;
            }

            const result = fn(current);

            /**
             * 明确阻止
             */
            if (result === SIGNAL.BLOCK) {
                return {
                    blocked: true,
                    value: current,
                };
            }

            /**
             * 普通函数返回 Promise：
             *
             * 不能 await。
             *
             * 因此直接放弃本次 Hook 返回结果。
             */
            if (isPromiseLike(result)) {
                continue;
            }

            /**
             * undefined：
             *
             * 不处理。
             */
            if (result === undefined) {
                continue;
            }

            /**
             * 普通返回值：
             *
             * 作为修改后的数据继续传递。
             */
            current = result;
        }

        return {
            blocked: false,
            value: current,
        };
    };

    /**
     * ========================================================
     * 异步 Hook 执行器
     * ========================================================
     *
     * 专门用于：
     *
     *   - 异步 XHR
     *
     * 允许注册函数返回 Promise。
     *
     * 所有 Hook 按注册顺序串行执行。
     */
    const runAsyncHookHandlers = async (registrar, value) => {
        let current = value;

        for (const fn of registrar) {
            const result = await fn(current);

            /**
             * 阻止
             */
            if (result === SIGNAL.BLOCK) {
                return {
                    blocked: true,
                    value: current,
                };
            }

            /**
             * 不处理
             */
            if (result === undefined) {
                continue;
            }

            /**
             * 修改
             */
            current = result;
        }

        return {
            blocked: false,
            value: current,
        };
    };

    /**
     * ========================================================
     * 初始化 Hook
     * ========================================================
     */
    const xhrAndFetch = () => {
        /**
         * 每个方向独立的注册器。
         */
        const onReq = hookHandler.onReq = createFnsRegistrar();
        const onRes = hookHandler.onRes = createFnsRegistrar();
        if (HookConfig.xhr === '1') {
          /**
           * ====================================================
           * XHR Hook
           * ====================================================
           */
          hookXhr({
              /**
               * ------------------------------------------------
               * XHR Request
               * ------------------------------------------------
               *
               * 注意：
               *
               * 这里不判断目标接口。
               *
               * 目标接口判断全部交给 onReq 注册函数。
               */
              onRequest: (config, handler) => {
                  /**
                   * XHR Hook 必须提供 async 状态。
                   *
                   * 如果你的 hookXhr 当前字段不是 async，
                   * 需要在 hookXhr 内部把 open() 的 async
                   * 状态传出来。
                   */
                  if (config.async === false) {
                      /**
                       * 同步 XHR
                       *
                       * 只能使用同步 Hook。
                       */
                      const result = runSyncHookHandlers(
                          onReq,
                          config
                      );

                      if (result.blocked) {
                          /**
                           * 不调用 next()
                           *
                           * 代表阻止请求。
                           */
                          return;
                      }

                      handler.next(result.value);
                      return;
                  }

                  /**
                   * 异步 XHR
                   *
                   * 可以执行异步 Hook。
                   */
                  runAsyncHookHandlers(onReq, config)
                      .then((result) => {
                          if (result.blocked) {
                              return;
                          }

                          handler.next(result.value);
                      });
              },

              /**
               * ------------------------------------------------
               * XHR Response
               * ------------------------------------------------
               */
              onResponse: (response, handler) => {
                  /**
                   * 响应对象需要能够获取本次 XHR
                   * 是否为同步请求。
                   *
                   * 推荐 hookXhr 给 response 保留：
                   *
                   *   response.async
                   *
                   * 或：
                   *
                   *   response.config.async
                   */
                  const isSync =
                      response.async === false ||
                      response.config?.async === false;

                  if (isSync) {
                      /**
                       * 同步 XHR：
                       *
                       * 只执行同步 Hook。
                       */
                      const result = runSyncHookHandlers(
                          onRes,
                          response
                      );

                      if (result.blocked) {
                          return;
                      }

                      handler.next(result.value);
                      return;
                  }

                  /**
                   * 异步 XHR：
                   *
                   * 允许异步 Hook。
                   */
                  runAsyncHookHandlers(onRes, response)
                      .then((result) => {
                          if (result.blocked) {
                              return;
                          }

                          handler.next(result.value);
                      });
              },
          }); 
        }

        if (HookConfig.fetch === '1') {
          /**
           * ====================================================
           * fetch Hook
           * ====================================================
           */
        }

        return {
            onReq,
            onRes,
        };
    };

    /**
     * ========================================================
     * 初始化
     * ========================================================
     */
    if (HookConfig.xhr === '1' || HookConfig.fetch === '1') {
      xhrAndFetch();
    }

    /**
     * ========================================================
     * 对外暴露
     * ========================================================
     *
     * 如果你的项目本身有自己的模块管理，
     * 这里可以改成你自己的注册方式。
     *
     * 不建议污染 window。
     *
     * 当前为了演示调用方式，挂到模块内部即可。
     */
    console.log('hookHandler', hookHandler);
    globalThis.hookHandler = hookHandler;
})();