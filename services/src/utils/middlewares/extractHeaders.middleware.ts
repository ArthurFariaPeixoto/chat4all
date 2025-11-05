import { Injectable, NestMiddleware } from "@nestjs/common";
import { Request, Response, NextFunction } from "express";
import { extractJWTFromHeaderLogin, extractJWTFromHeaderOrigin } from "../FormatUtils";

const routes = ["/login"];
function rotaException(rota: string): boolean {
    return routes.some((permittedRoute) => rota.includes(permittedRoute));
}

@Injectable()
export class ExtractHeaders implements NestMiddleware {
    use(req: Request, res: Response, next: NextFunction) {
        if (!rotaException(req.originalUrl)) {
            req.headers["login"] = extractJWTFromHeaderLogin(req.headers);
            req.headers["origin"] = extractJWTFromHeaderOrigin(req.headers);
        }
        next();
    }
}
