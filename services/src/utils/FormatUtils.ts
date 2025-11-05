import { UnauthorizedException } from "@nestjs/common";
import jwt_decode from "jwt-decode";

const extractJWTFromHeaderLogin = (header) => {
    try {
        const dados: any = jwt_decode(header.authorization);
        return dados.login;
    } catch (err) {
        throw new UnauthorizedException("Falha de autenticação: token inválido ou não enviado");
    }
};

const extractJWTFromHeaderOrigin = (header) => {
    try {
        const dados: any = jwt_decode(header.authorization);
        return dados.tipo;
    } catch (err) {
        throw new UnauthorizedException("Falha de autenticação: token inválido ou não enviado");
    }
};

export { extractJWTFromHeaderLogin, extractJWTFromHeaderOrigin };
