import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { ConnectorService } from './connector.service';

@Controller()
export class ConnectorController {
  constructor(private readonly connectorService: ConnectorService) {}

  @GrpcMethod('ConnectorService', 'UploadConnector')
  async uploadConnector(data: any) {
    // Mock de upload conforme PDF
    // data: { name, type, config, file }
    return this.connectorService.uploadConnector(data);
  }

  @GrpcMethod('ConnectorService', 'ListConnectors')
  async listConnectors() {
    return this.connectorService.listConnectors();
  }
}