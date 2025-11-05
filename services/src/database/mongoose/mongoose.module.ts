// src/database/mongoose/mongoose.module.ts
import { Global, Module } from "@nestjs/common";
import { MongooseModule, getConnectionToken } from "@nestjs/mongoose";
import { Connection } from "mongoose";

@Global()
@Module({
    imports: [
        MongooseModule.forRoot(process.env.MONGO_URI ?? "mongodb://localhost/myapp", {
            dbName: process.env.MONGO_DBNAME,
        }),
    ],
    providers: [
        {
            provide: Connection,
            useFactory: (connection: Connection) => connection,
            inject: [getConnectionToken()],
        },
    ],
    exports: [Connection],
})
export class MongoModule {}
