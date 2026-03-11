"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const common_1 = require("@nestjs/common");
const app_module_1 = require("./app.module");
const app_factory_1 = require("./app.factory");
const config_1 = require("@smart-schedule/config");
const contracts_1 = require("@smart-schedule/contracts");
async function bootstrap() {
    const config = config_1.configService.all;
    const app = await core_1.NestFactory.create(app_module_1.AppModule, (0, app_factory_1.createApiAdapter)());
    (0, app_factory_1.configureApiApp)(app);
    await app.listen({
        host: config.HOST,
        port: config.PORT,
    });
    common_1.Logger.log(`${contracts_1.runtimeServices.api.displayName} is running on: ${await app.getUrl()}`);
}
void bootstrap();
//# sourceMappingURL=main.js.map