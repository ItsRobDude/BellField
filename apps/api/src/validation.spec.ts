import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { EquipmentController } from './modules/equipment/equipment.controller';
import { EquipmentService } from './modules/equipment/equipment.service';
import { IdentityAccessController } from './modules/identity-access/identity-access.controller';
import { IdentityAccessService } from './modules/identity-access/identity-access.service';
import { JobsAppointmentsController } from './modules/jobs-appointments/jobs-appointments.controller';
import { JobsAppointmentsService } from './modules/jobs-appointments/jobs-appointments.service';

describe('Runtime validation', () => {
  let app: INestApplication;
  const identityAccessService = {
    login: jest.fn(),
    getCurrentEmployee: jest.fn(),
    getRoleTemplatesForOffice: jest.fn(),
    getEmployees: jest.fn(),
    updateEmployee: jest.fn()
  };
  const jobsAppointmentsService = {
    createJob: jest.fn(),
    updateJobStatus: jest.fn()
  };
  const equipmentService = {};

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [IdentityAccessController, JobsAppointmentsController, EquipmentController],
      providers: [
        { provide: IdentityAccessService, useValue: identityAccessService },
        { provide: JobsAppointmentsService, useValue: jobsAppointmentsService },
        { provide: EquipmentService, useValue: equipmentService }
      ]
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true
      })
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects malformed login payloads with 400', async () => {
    const response = await request(app.getHttpServer()).post('/identity/auth/login').send({
      email: 'not-an-email',
      password: '',
      surface: 'desktop-app'
    });

    expect(response.status).toBe(400);
    expect(identityAccessService.login).not.toHaveBeenCalled();
  });

  it('rejects invalid job status payloads with 400', async () => {
    const response = await request(app.getHttpServer())
      .patch('/operations/jobs/job-1/status')
      .send({
        status: 'done'
      });

    expect(response.status).toBe(400);
    expect(jobsAppointmentsService.updateJobStatus).not.toHaveBeenCalled();
  });
});
