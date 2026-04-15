import { Body, Controller, Get, Headers, Param, Patch, Post } from '@nestjs/common';
import {
  AddJobNoteRequestBodyDto,
  CreateAppointmentRequestBodyDto,
  CreateJobRequestBodyDto,
  UpdateAppointmentStatusRequestBodyDto,
  UpdateJobStatusRequestBodyDto
} from './jobs-appointments.dto';
import { JobsAppointmentsService } from './jobs-appointments.service';

@Controller('operations/jobs')
export class JobsAppointmentsController {
  constructor(private readonly jobsAppointmentsService: JobsAppointmentsService) {}

  @Get()
  async getWorkspace(@Headers('authorization') authorizationHeader?: string) {
    return this.jobsAppointmentsService.getWorkspace(this.getBearerToken(authorizationHeader));
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

  @Post(':jobId/notes')
  async addJobNote(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Param('jobId') jobId: string,
    @Body() request: AddJobNoteRequestBodyDto
  ) {
    return this.jobsAppointmentsService.addJobNote(this.getBearerToken(authorizationHeader), jobId, request);
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
