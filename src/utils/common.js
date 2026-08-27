// 全局对象
export const GT = globalThis;
// 原始接口
export const nativeApis = {
    xhr: GT.XMLHttpRequest,
    fetch: GT.fetch,
    ws: GT.WebSocket,
    jsonDecode: JSON.parse,
    jsonEncode: JSON.stringify,
}

/**
 * ============================================================
 * 函数注册器
 * ============================================================
 *
 * 使用 Set 保存 Hook 函数。
 *
 * 特点：
 *
 * 1. 自动去重
 * 2. 支持直接调用注册
 * 3. 支持数组注册
 * 4. 支持 add / delete / has / clear
 * 5. 支持 forEach
 * 6. 支持 values / keys / entries
 * 7. 支持 for...of
 * 8. 支持 size
 * 9. 支持链式注册
 *
 * 示例：
 *
 * const registrar = createFnsRegistrar();
 *
 * registrar(fn1);
 *
 * registrar([
 *     fn2,
 *     fn3
 * ]);
 *
 * registrar.add(fn4);
 *
 * registrar.delete(fn2);
 *
 * for (const fn of registrar) {
 *     fn();
 * }
 *
 * ============================================================
 */
export const createFnsRegistrar = () => {

    const set = new Set();


    /**
     * ----------------------------------------------------------
     * 主注册函数
     * ----------------------------------------------------------
     */
    const registrar = (fn) => {

        /**
         * 注册函数数组
         */
        if (Array.isArray(fn)) {

            for (const item of fn) {

                if (typeof item === 'function') {

                    set.add(item);
                }
            }
        }

        /**
         * 注册单个函数
         */
        else if (typeof fn === 'function') {

            set.add(fn);
        }


        return registrar;
    };


    /**
     * ----------------------------------------------------------
     * add
     * ----------------------------------------------------------
     */
    registrar.add = (fn) => {

        if (typeof fn === 'function') {

            set.add(fn);
        }


        return registrar;
    };


    /**
     * ----------------------------------------------------------
     * delete
     * ----------------------------------------------------------
     */
    registrar.delete = (fn) => {

        return set.delete(fn);
    };


    /**
     * ----------------------------------------------------------
     * has
     * ----------------------------------------------------------
     */
    registrar.has = (fn) => {

        return set.has(fn);
    };


    /**
     * ----------------------------------------------------------
     * clear
     * ----------------------------------------------------------
     */
    registrar.clear = () => {

        set.clear();
    };


    /**
     * ----------------------------------------------------------
     * forEach
     * ----------------------------------------------------------
     *
     * 保持和 Set.forEach 一致。
     */
    registrar.forEach = (
        callback,
        thisArg
    ) => {

        return set.forEach(
            callback,
            thisArg
        );
    };


    /**
     * ----------------------------------------------------------
     * values
     * ----------------------------------------------------------
     */
    registrar.values = () => {

        return set.values();
    };


    /**
     * ----------------------------------------------------------
     * keys
     * ----------------------------------------------------------
     */
    registrar.keys = () => {

        return set.keys();
    };


    /**
     * ----------------------------------------------------------
     * entries
     * ----------------------------------------------------------
     */
    registrar.entries = () => {

        return set.entries();
    };


    /**
     * ----------------------------------------------------------
     * Symbol.iterator
     * ----------------------------------------------------------
     *
     * 支持：
     *
     * for (const fn of registrar)
     */
    registrar[Symbol.iterator] = () => {

        return set[Symbol.iterator]();
    };


    /**
     * ----------------------------------------------------------
     * size
     * ----------------------------------------------------------
     */
    Object.defineProperty(
        registrar,
        'size',
        {
            enumerable: true,

            get() {

                return set.size;
            }
        }
    );


    return registrar;
};


/**
 * ============================================================
 * 判断 Hook 配置是否开启
 * ============================================================
 *
 * 当前约定：
 *
 *     '1' = 开启
 *     其他 = 关闭
 *
 * 不使用：
 *
 *     Boolean(value)
 *
 * 因为：
 *
 *     Boolean('0') === true
 *
 * 这显然不是我们想要的行为。
 * ============================================================
 */
export const isHookEnabled = (value) => {

    return value === '1';
};


/**
 * ============================================================
 * 判断 Promise / Thenable
 * ============================================================
 *
 * 不使用：
 *
 *     value instanceof Promise
 *
 * 原因：
 *
 * 1. 跨 Realm Promise 不一定能通过 instanceof
 * 2. 外部 Hook 也可能返回 Promise-like 对象
 *
 * 我们真正关心的是：
 *
 *     是否具有 then()
 *
 * ============================================================
 */
export const isPromiseLike = (value) => {

    return (
        value !== null &&
        value !== undefined &&
        (
            typeof value === 'object' ||
            typeof value === 'function'
        ) &&
        typeof value.then === 'function'
    );
};

/**
 * 判断是否普通对象
 * isPlainObject({})                 // true
 * isPlainObject(Object.create(null))// true 无原型空对象
 * isPlainObject(new Object)         // true
 * 
 * class Foo {}
 * isPlainObject(new Foo())          // false ✅ 类实例被排除
 * 
 * isPlainObject([])                 // false
 * isPlainObject(null)               // false
 * isPlainObject(new Date)           // false
 * 
 * @param {*} val 
 * @returns 
 */
function isPlainObject(val) {
  if (Object.prototype.toString.call(val) !== '[object Object]') return false;

  const proto = Object.getPrototypeOf(val);
  // 原型是 Object.prototype 或者 null（Object.create(null)）
  return proto === Object.prototype || proto === null;
}


/**
 * 匹配单条规则
 *
 * @param {string} value       待匹配值
 * @param {Object} rule        匹配规则
 * @param {string} rule.match  匹配内容
 * @param {string} rule.type   匹配类型
 *
 * @returns {boolean}
 */
export const matchRule = (value, rule) => {
    if (typeof value !== 'string' || !rule || typeof rule !== 'object') {
        return false;
    }

    const { match, type } = rule;

    if (typeof match !== 'string' || !type) {
        return false;
    }

    switch (type) {
        case 'startsWith':
            return value.startsWith(match);

        case 'includes':
            return value.includes(match);

        case 'endsWith':
            return value.endsWith(match);

        case 'equal':
            return value === match;

        case 'regex':
            try {
                return new RegExp(match).test(value);
            } catch {
                return false;
            }

        default:
            return false;
    }
};

/**
 * 匹配规则列表
 *
 * 任意一条规则命中即返回 true
 *
 * @param {string} value
 * @param {Array} rules
 * @returns {boolean}
 */
export const matchRules = (value, rules) => {
    if (!Array.isArray(rules) || rules.length === 0) {
        return false;
    }

    return rules.some(rule => matchRule(value, rule));
};