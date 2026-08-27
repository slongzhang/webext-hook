import { defineConfig } from 'vite';
import { resolve } from 'path';

const globalName = 'webextInit';

export default defineConfig(({ mode }) => {
    // 判断是否为开发模式
    const isDev = mode === 'development';

    return {
        resolve: {
            alias: {
                '~': resolve(__dirname, 'src'),
            },
        },
        build: {
            emptyOutDir: isDev ? true : false,
            // 开发模式不压缩，生产模式压缩
            minify: isDev ? false : 'terser',
            // 开发模式生成 sourcemap
            sourcemap: isDev ? 'inline' : false,
            terserOptions: {
                compress: {
                    drop_console: !isDev, // 开发模式保留 console
                    drop_debugger: !isDev, // 开发模式保留 debugger
                },
                format: {
                    comments: false,
                    beautify: isDev, // 开发模式美化代码
                },
            },
            lib: {
                entry: 'src/index.js',
                name: globalName,
                fileName: (format) => `${globalName}${isDev ? '' : '.min'}.js`,
                formats: ['iife'],
            },
            rollupOptions: {
                output: {
                    exports: 'auto',
                },
            },
        },
        define: {
            global: 'globalThis',
        },
        optimizeDeps: {
            include: ['buffer'],
            esbuildOptions: {
                define: {
                    global: 'globalThis',
                },
            },
        },
        plugins: [
            // {
            //   name: 'assets-rewrite',
            //   enforce: 'post',
            //   apply: 'build',
            //   generateBundle(_, bundle) {
            //     for (const fileName in bundle) {
            //       const chunk = bundle[fileName];
            //       if (chunk.type === 'chunk' && fileName.endsWith('.js')) {
            //         // 只在生产环境添加全局变量定义
            //         if (!isDev) {
            //           chunk.code += `;if (typeof chrome !== 'undefined' && typeof chrome?.runtime?.getURL == 'function') {globalThis.${globalName} = ${globalName}}`;
            //         }
            //       }
            //     }
            //   },
            // },
        ],
    };
});
