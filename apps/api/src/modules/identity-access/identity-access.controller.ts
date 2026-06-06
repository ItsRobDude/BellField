import { Body, Controller, Get, Headers, Param, Patch, Post } from '@nestjs/common';
import {
  CreateEmployeeRequestBodyDto,
  LoginRequestBodyDto,
  ResetEmployeePasswordRequestBodyDto,
  UpdateEmployeeRequestBodyDto
} from './identity-access.dto';
import { IdentityAccessService } from './identity-access.service';

@Controller('identity')
export class IdentityAccessController {
  constructor(private readonly identityAccessService: IdentityAccessService) {}

  @Post('auth/login')
  async login(@Body() loginRequest: LoginRequestBodyDto) {
    return this.identityAccessService.login(loginRequest);
  }

  @Get('auth/me')
  async getCurrentEmployee(@Headers('authorization') authorizationHeader?: string) {
    return {
      employee: await this.identityAccessService.getCurrentEmployee(
        this.getBearerToken(authorizationHeader)
      )
    };
  }

  @Get('roles')
  async getRoles(@Headers('authorization') authorizationHeader?: string) {
    return {
      roles: await this.identityAccessService.getRoleTemplatesForOffice(
        this.getBearerToken(authorizationHeader)
      )
    };
  }

  @Get('employees')
  async getEmployees(@Headers('authorization') authorizationHeader?: string) {
    return {
      employees: await this.identityAccessService.getEmployees(
        this.getBearerToken(authorizationHeader)
      )
    };
  }

  @Post('employees')
  async createEmployee(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Body() createEmployeeRequest: CreateEmployeeRequestBodyDto
  ) {
    return this.identityAccessService.createEmployee(
      this.getBearerToken(authorizationHeader),
      createEmployeeRequest
    );
  }

  @Get('employees/:employeeId')
  async getEmployeeDetail(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Param('employeeId') employeeId: string
  ) {
    return this.identityAccessService.getEmployeeDetail(
      this.getBearerToken(authorizationHeader),
      employeeId
    );
  }

  @Patch('employees/:employeeId')
  async updateEmployee(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Param('employeeId') employeeId: string,
    @Body() updateEmployeeRequest: UpdateEmployeeRequestBodyDto
  ) {
    return this.identityAccessService.updateEmployee(
      this.getBearerToken(authorizationHeader),
      employeeId,
      updateEmployeeRequest
    );
  }

  @Post('employees/:employeeId/password-reset')
  async resetEmployeePassword(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Param('employeeId') employeeId: string,
    @Body() resetRequest: ResetEmployeePasswordRequestBodyDto
  ) {
    return this.identityAccessService.resetEmployeePassword(
      this.getBearerToken(authorizationHeader),
      employeeId,
      resetRequest
    );
  }

  @Get('employees/:employeeId/sessions')
  async getEmployeeSessions(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Param('employeeId') employeeId: string
  ) {
    return this.identityAccessService.listEmployeeSessions(
      this.getBearerToken(authorizationHeader),
      employeeId
    );
  }

  @Post('employees/:employeeId/sessions/:sessionId/revoke')
  async revokeEmployeeSession(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Param('employeeId') employeeId: string,
    @Param('sessionId') sessionId: string
  ) {
    return this.identityAccessService.revokeEmployeeSession(
      this.getBearerToken(authorizationHeader),
      employeeId,
      sessionId
    );
  }

  private getBearerToken(authorizationHeader: string | undefined): string {
    if (!authorizationHeader) {
      return '';
    }

    const [scheme, token] = authorizationHeader.split(' ');

    return scheme?.toLowerCase() === 'bearer' && token ? token : '';
  }
}
