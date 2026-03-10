"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const common_1 = require("@nestjs/common");
const config_1 = require("@smart-schedule/config");
const contracts_1 = require("@smart-schedule/contracts");
const app_module_1 = require("./app.module");
async function bootstrap() {
    const config = config_1.configService.all;
    const app = await core_1.NestFactory.create(app_module_1.AppModule);
    await app.listen(config.PORT, config.HOST);
    common_1.Logger.log(`${contracts_1.runtimeServices.scheduler.displayName} is running on: ${await app.getUrl()}`);
}
void bootstrap();
//# sourceMappingURL=main.js.map