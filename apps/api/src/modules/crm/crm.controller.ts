import { Body, Controller, Get, Headers, Param, Patch, Post, Query } from '@nestjs/common';
import {
  CreateContactRequestBodyDto,
  CreateCustomerRequestBodyDto,
  CreateLocationRequestBodyDto,
  LinkContactRequestBodyDto,
  ReassignLocationOwnerRequestBodyDto,
  UpdateContactLinkRequestBodyDto,
  UpdateContactRequestBodyDto,
  UpdateCustomerRequestBodyDto,
  UpdateLocationRequestBodyDto
} from './crm.dto';
import { CrmService } from './crm.service';

@Controller('operations/crm')
export class CrmController {
  constructor(private readonly crmService: CrmService) {}

  @Get()
  async getWorkspace(@Headers('authorization') authorizationHeader?: string) {
    return this.crmService.getWorkspace(this.getBearerToken(authorizationHeader));
  }

  @Get('search')
  async search(@Headers('authorization') authorizationHeader: string | undefined, @Query('q') query = '') {
    return this.crmService.search(this.getBearerToken(authorizationHeader), query);
  }

  @Get('customers/:customerId')
  async getCustomerDetail(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Param('customerId') customerId: string
  ) {
    return this.crmService.getCustomerDetail(this.getBearerToken(authorizationHeader), customerId);
  }

  @Post('customers')
  async createCustomer(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Body() request: CreateCustomerRequestBodyDto
  ) {
    return this.crmService.createCustomer(this.getBearerToken(authorizationHeader), request);
  }

  @Patch('customers/:customerId')
  async updateCustomer(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Param('customerId') customerId: string,
    @Body() request: UpdateCustomerRequestBodyDto
  ) {
    return this.crmService.updateCustomer(this.getBearerToken(authorizationHeader), customerId, request);
  }

  @Get('locations/:locationId')
  async getLocationDetail(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Param('locationId') locationId: string
  ) {
    return this.crmService.getLocationDetail(this.getBearerToken(authorizationHeader), locationId);
  }

  @Post('locations')
  async createLocation(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Body() request: CreateLocationRequestBodyDto
  ) {
    return this.crmService.createLocation(this.getBearerToken(authorizationHeader), request);
  }

  @Patch('locations/:locationId')
  async updateLocation(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Param('locationId') locationId: string,
    @Body() request: UpdateLocationRequestBodyDto
  ) {
    return this.crmService.updateLocation(this.getBearerToken(authorizationHeader), locationId, request);
  }

  @Post('locations/:locationId/reassign-owner')
  async reassignLocationOwner(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Param('locationId') locationId: string,
    @Body() request: ReassignLocationOwnerRequestBodyDto
  ) {
    return this.crmService.reassignLocationOwner(this.getBearerToken(authorizationHeader), locationId, request);
  }

  @Get('contacts/:contactId')
  async getContactDetail(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Param('contactId') contactId: string
  ) {
    return this.crmService.getContactDetail(this.getBearerToken(authorizationHeader), contactId);
  }

  @Post('contacts')
  async createContact(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Body() request: CreateContactRequestBodyDto
  ) {
    return this.crmService.createContact(this.getBearerToken(authorizationHeader), request);
  }

  @Patch('contacts/:contactId')
  async updateContact(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Param('contactId') contactId: string,
    @Body() request: UpdateContactRequestBodyDto
  ) {
    return this.crmService.updateContact(this.getBearerToken(authorizationHeader), contactId, request);
  }

  @Post('contact-links')
  async linkContact(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Body() request: LinkContactRequestBodyDto
  ) {
    return this.crmService.linkContact(this.getBearerToken(authorizationHeader), request);
  }

  @Patch('contact-links/:linkId')
  async updateContactLink(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Param('linkId') linkId: string,
    @Body() request: UpdateContactLinkRequestBodyDto
  ) {
    return this.crmService.updateContactLink(this.getBearerToken(authorizationHeader), linkId, request);
  }

  private getBearerToken(authorizationHeader: string | undefined): string {
    if (!authorizationHeader) {
      return '';
    }

    const [scheme, token] = authorizationHeader.split(' ');
    return scheme?.toLowerCase() === 'bearer' && token ? token : '';
  }
}
