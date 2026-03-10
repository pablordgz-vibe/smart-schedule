"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const common_1 = require("@nestjs/common");
const app_module_1 = require("./app.module");
const config_1 = require("@smart-schedule/config");
async function bootstrap() {
    const config = config_1.configService.all;
    const app = await core_1.NestFactory.create(app_module_1.AppModule);
    await app.listen(config.PORT);
    common_1.Logger.log(`API is running on: ${await app.getUrl()}`);
}
void bootstrap();
//# sourceMappingURL=main.js.map