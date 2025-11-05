import { Module } from "@nestjs/common";
import { TestsService } from "./test.service";
import { MongoModule } from "src/database/mongoose/mongoose.module";

@Module({
    imports: [MongoModule],
    providers: [TestsService],
})
export class TestModule {}
