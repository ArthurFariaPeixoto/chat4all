import { Inject, Injectable } from "@nestjs/common";
import { Model } from "mongoose";
import { Test } from "src/database/mongoose/schemas/test.schema";

@Injectable()
export class TestsService {
    constructor(@Inject("TEST_MODEL") private testModel: Model<Test>) {}

    async findAll() {
        return this.testModel.find().exec();
    }
}
