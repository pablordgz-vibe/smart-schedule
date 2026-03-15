"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const unplugin_swc_1 = __importDefault(require("unplugin-swc"));
const config_1 = require("vitest/config");
exports.default = (0, config_1.defineConfig)({
    test: {
        coverage: {
            all: false,
            clean: true,
            provider: 'v8',
            reporter: ['json-summary', 'text'],
            reportsDirectory: './coverage',
        },
        globals: true,
        passWithNoTests: true,
        root: './',
        include: ['src/**/*.spec.ts'],
        environment: 'node',
    },
    plugins: [
        unplugin_swc_1.default.vite({
            module: { type: 'es6' },
        }),
    ],
});
//# sourceMappingURL=vitest.config.js.map