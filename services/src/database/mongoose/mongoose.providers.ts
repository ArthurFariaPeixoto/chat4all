import { Connection } from "mongoose";
import { TestSchema } from "./schemas/test.schema";

export const mongooseProviders = [
    {
        provide: "TEST_MODEL",
        useFactory: (connection: Connection) => connection.model("Test", TestSchema),
        inject: ["DATABASE_CONNECTION"],
    },
];
