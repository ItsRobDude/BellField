import { Body, Controller, Get, Headers, Param, Patch, Post } from '@nestjs/common';
import { JobsAppointmentsService } from './jobs-appointments.service';
import type {
  AddJobNoteRequestDto,
  CreateAppointmentRequestDto,
  CreateJobRequestDto,
  UpdateAppointmentStatusRequestDto,
  UpdateJobStatusRequestDto
} from './jobs-appointments.types';

@Controller('operations/jobs')
export class JobsAppointmentsController {
  constructor(private readonly jobsAppointmentsService: JobsAppointmentsService) {}

  @Get()
  async getWorkspace(@Headers('authorization') authorizationHeader?: string) {
    return this.jobsAppointmentsService.getWorkspace(this.getBearerToken(authorizationHeader));
  }

  @Post()
  async createJob(@Headers('authorization') authorizationHeader: string | undefined, @Body() request: CreateJobRequestDto) {
    return this.jobsAppointmentsService.createJob(this.getBearerToken(authorizationHeader), request);
  }

  @Patch(':jobId/status')
  async updateJobStatus(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Param('jobId') jobId: string,
    @Body() request: UpdateJobStatusRequestDto
  ) {
    return this.jobsAppointmentsService.updateJobStatus(this.getBearerToken(authorizationHeader), jobId, request);
  }

  @Post(':jobId/appointments')
  async addAppointment(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Param('jobId') jobId: string,
    @Body() request: CreateAppointmentRequestDto
  ) {
    return this.jobsAppointmentsService.addAppointment(this.getBearerToken(authorizationHeader), jobId, request);
  }

  @Post(':jobId/notes')
  async addJobNote(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Param('jobId') jobId: string,
    @Body() request: AddJobNoteRequestDto
  ) {
    return this.jobsAppointmentsService.addJobNote(this.getBearerToken(authorizationHeader), jobId, request);
  }

  @Patch('appointments/:appointmentId/status')
  async updateAppointmentStatus(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Param('appointmentId') appointmentId: string,
    @Body() request: UpdateAppointmentStatusRequestDto
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
