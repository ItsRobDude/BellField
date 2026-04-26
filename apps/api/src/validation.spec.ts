import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { CrmController } from './modules/crm/crm.controller';
import { CrmService } from './modules/crm/crm.service';
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
    updateJobStatus: jest.fn(),
    addAppointment: jest.fn(),
    updateAppointmentStatus: jest.fn(),
    addJobNote: jest.fn()
  };
  const equipmentService = {
    updateEquipment: jest.fn()
  };
  const crmService = {
    createCustomer: jest.fn(),
    updateContactLink: jest.fn()
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [IdentityAccessController, JobsAppointmentsController, EquipmentController, CrmController],
      providers: [
        { provide: IdentityAccessService, useValue: identityAccessService },
        { provide: JobsAppointmentsService, useValue: jobsAppointmentsService },
        { provide: EquipmentService, useValue: equipmentService },
        { provide: CrmService, useValue: crmService }
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

  it('rejects malformed appointment payloads with 400', async () => {
    const response = await request(app.getHttpServer())
      .post('/operations/jobs/job-1/appointments')
      .send({
        scheduledDate: '04/14/2026',
        timeWindowLabel: 'Morning'
      });

    expect(response.status).toBe(400);
    expect(jobsAppointmentsService.addAppointment).not.toHaveBeenCalled();
  });

  it('rejects malformed appointment status payloads with 400', async () => {
    const response = await request(app.getHttpServer())
      .patch('/operations/jobs/appointments/appointment-1/status')
      .send({
        status: 'done',
        occurredAt: 'not-a-date'
      });

    expect(response.status).toBe(400);
    expect(jobsAppointmentsService.updateAppointmentStatus).not.toHaveBeenCalled();
  });

  it('rejects malformed job note payloads with 400', async () => {
    const response = await request(app.getHttpServer())
      .post('/operations/jobs/job-1/notes')
      .send({
        note: '',
        occurredAt: 'not-a-date'
      });

    expect(response.status).toBe(400);
    expect(jobsAppointmentsService.addJobNote).not.toHaveBeenCalled();
  });

  it('rejects malformed equipment update payloads with 400', async () => {
    const response = await request(app.getHttpServer())
      .patch('/operations/equipment/equipment-1')
      .send({
        status: 'broken',
        installDate: '14-04-2026'
      });

    expect(response.status).toBe(400);
    expect(equipmentService.updateEquipment).not.toHaveBeenCalled();
  });

  it('rejects malformed CRM customer payloads with 400', async () => {
    const response = await request(app.getHttpServer())
      .post('/operations/crm/customers')
      .send({
        name: '',
        accountType: 'company',
        billingAddressLine1: '100 Main St',
        billingCity: 'Seattle',
        billingState: 'WA',
        billingPostalCode: '98101'
      });

    expect(response.status).toBe(400);
    expect(crmService.createCustomer).not.toHaveBeenCalled();
  });

  it('rejects malformed CRM contact-link payloads with 400', async () => {
    const response = await request(app.getHttpServer())
      .patch('/operations/crm/contact-links/link-1')
      .send({
        endDate: '04/26/2026'
      });

    expect(response.status).toBe(400);
    expect(crmService.updateContactLink).not.toHaveBeenCalled();
  });
});
