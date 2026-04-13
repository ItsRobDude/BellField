import { Body, Controller, Get, Headers, Param, Patch, Post } from '@nestjs/common';
import { IdentityAccessService } from './identity-access.service';
import type { LoginRequestDto, UpdateEmployeeRequestDto } from './identity-access.types';

@Controller('identity')
export class IdentityAccessController {
  constructor(private readonly identityAccessService: IdentityAccessService) {}

  @Post('auth/login')
  login(@Body() loginRequest: LoginRequestDto) {
    return this.identityAccessService.login(loginRequest);
  }

  @Get('auth/me')
  getCurrentEmployee(@Headers('authorization') authorizationHeader?: string) {
    return {
      employee: this.identityAccessService.getCurrentEmployee(this.getBearerToken(authorizationHeader))
    };
  }

  @Get('roles')
  getRoles(@Headers('authorization') authorizationHeader?: string) {
    this.identityAccessService.getCurrentEmployee(this.getBearerToken(authorizationHeader));

    return {
      roles: this.identityAccessService.getRoleTemplates()
    };
  }

  @Get('employees')
  getEmployees(@Headers('authorization') authorizationHeader?: string) {
    return {
      employees: this.identityAccessService.getEmployees(this.getBearerToken(authorizationHeader))
    };
  }

  @Patch('employees/:employeeId')
  updateEmployee(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Param('employeeId') employeeId: string,
    @Body() updateEmployeeRequest: UpdateEmployeeRequestDto
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
