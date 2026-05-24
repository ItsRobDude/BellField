import { Body, Controller, Get, Headers, Param, Patch, Post } from '@nestjs/common';
import { LoginRequestBodyDto, UpdateEmployeeRequestBodyDto } from './identity-access.dto';
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

  private getBearerToken(authorizationHeader: string | undefined): string {
    if (!authorizationHeader) {
      return '';
    }

    const [scheme, token] = authorizationHeader.split(' ');

    return scheme?.toLowerCase() === 'bearer' && token ? token : '';
  }
}
