import { Body, Controller, Get, Headers, Param, Patch, Post } from '@nestjs/common';
import {
  AddJobNoteRequestBodyDto,
  AcknowledgeFinishedVisitReviewRequestBodyDto,
  CreateAppointmentRequestBodyDto,
  CreateJobRequestBodyDto,
  CreateRegisterEntryRequestBodyDto,
  UpdateAppointmentScheduleRequestBodyDto,
  UpdateAppointmentStatusRequestBodyDto,
  UpdateRegisterEntryRequestBodyDto,
  UpdateJobStatusRequestBodyDto,
  VoidRegisterEntryRequestBodyDto
} from './jobs-appointments.dto';
import { JobsAppointmentsService } from './jobs-appointments.service';

@Controller('operations/jobs')
export class JobsAppointmentsController {
  constructor(private readonly jobsAppointmentsService: JobsAppointmentsService) {}

  @Get()
  async getWorkspace(@Headers('authorization') authorizationHeader?: string) {
    return this.jobsAppointmentsService.getWorkspace(this.getBearerToken(authorizationHeader));
  }

  @Get('intake-context')
  async getIntakeContext(@Headers('authorization') authorizationHeader?: string) {
    return this.jobsAppointmentsService.getIntakeContext(this.getBearerToken(authorizationHeader));
  }

  @Post()
  async createJob(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Body() request: CreateJobRequestBodyDto
  ) {
    return this.jobsAppointmentsService.createJob(this.getBearerToken(authorizationHeader), request);
  }

  @Patch(':jobId/status')
  async updateJobStatus(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Param('jobId') jobId: string,
    @Body() request: UpdateJobStatusRequestBodyDto
  ) {
    return this.jobsAppointmentsService.updateJobStatus(this.getBearerToken(authorizationHeader), jobId, request);
  }

  @Post(':jobId/appointments')
  async addAppointment(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Param('jobId') jobId: string,
    @Body() request: CreateAppointmentRequestBodyDto
  ) {
    return this.jobsAppointmentsService.addAppointment(this.getBearerToken(authorizationHeader), jobId, request);
  }

  @Post(':jobId/finished-visit-review')
  async acknowledgeFinishedVisitReview(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Param('jobId') jobId: string,
    @Body() request: AcknowledgeFinishedVisitReviewRequestBodyDto
  ) {
    return this.jobsAppointmentsService.acknowledgeFinishedVisitReview(
      this.getBearerToken(authorizationHeader),
      jobId,
      request
    );
  }

  @Patch('appointments/:appointmentId')
  async updateAppointmentSchedule(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Param('appointmentId') appointmentId: string,
    @Body() request: UpdateAppointmentScheduleRequestBodyDto
  ) {
    return this.jobsAppointmentsService.updateAppointmentSchedule(
      this.getBearerToken(authorizationHeader),
      appointmentId,
      request
    );
  }

  @Post(':jobId/notes')
  async addJobNote(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Param('jobId') jobId: string,
    @Body() request: AddJobNoteRequestBodyDto
  ) {
    return this.jobsAppointmentsService.addJobNote(this.getBearerToken(authorizationHeader), jobId, request);
  }

  @Get(':jobId/register-entries')
  async listRegisterEntries(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Param('jobId') jobId: string
  ) {
    return this.jobsAppointmentsService.listRegisterEntries(this.getBearerToken(authorizationHeader), jobId, true);
  }

  @Post(':jobId/register-entries')
  async createRegisterEntry(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Param('jobId') jobId: string,
    @Body() request: CreateRegisterEntryRequestBodyDto
  ) {
    return this.jobsAppointmentsService.createRegisterEntry(this.getBearerToken(authorizationHeader), jobId, request);
  }

  @Patch('register-entries/:registerEntryId')
  async updateRegisterEntry(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Param('registerEntryId') registerEntryId: string,
    @Body() request: UpdateRegisterEntryRequestBodyDto
  ) {
    return this.jobsAppointmentsService.updateRegisterEntry(
      this.getBearerToken(authorizationHeader),
      registerEntryId,
      request
    );
  }

  @Post('register-entries/:registerEntryId/void')
  async voidRegisterEntry(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Param('registerEntryId') registerEntryId: string,
    @Body() request: VoidRegisterEntryRequestBodyDto
  ) {
    return this.jobsAppointmentsService.voidRegisterEntry(
      this.getBearerToken(authorizationHeader),
      registerEntryId,
      request
    );
  }

  @Patch('appointments/:appointmentId/status')
  async updateAppointmentStatus(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Param('appointmentId') appointmentId: string,
    @Body() request: UpdateAppointmentStatusRequestBodyDto
  ) {
    return this.jobsAppointmentsService.updateAppointmentStatus(
      this.getBearerToken(authorizationHeader),
      appointmentId,
      request
    );
  }

  @Get('field/assigned-work')
  async getAssignedWork(@Headers('authorization') authorizationHeader?: string) {
    return this.jobsAppointmentsService.getAssignedWork(this.getBearerToken(authorizationHeader));
  }

  private getBearerToken(authorizationHeader: string | undefined): string {
    if (!authorizationHeader) {
      return '';
    }

    const [scheme, token] = authorizationHeader.split(' ');
    return scheme?.toLowerCase() === 'bearer' && token ? token : '';
  }
}
