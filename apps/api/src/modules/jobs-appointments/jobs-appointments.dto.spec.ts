import { validate } from 'class-validator';
import { CreateAppointmentRequestBodyDto, CreateJobRequestBodyDto } from './jobs-appointments.dto';

function messages(errors: Awaited<ReturnType<typeof validate>>): string[] {
  return errors.flatMap((error) => Object.values(error.constraints ?? {}));
}

describe('jobs appointment DTO validation', () => {
  it('still requires scheduledDate when structured times are provided', async () => {
    const body = Object.assign(new CreateJobRequestBodyDto(), {
      locationId: 'location-1',
      jobType: 'Service',
      category: 'General',
      origin: 'Inbound phone call',
      summary: 'No heat',
      scheduledStartTime: '09:00'
    });

    expect(messages(await validate(body))).toContain(
      'scheduledDate is required when scheduledStartTime or scheduledEndTime is provided.'
    );
  });

  it('requires scheduledDate when a job intake appointment has only a time window', async () => {
    const body = Object.assign(new CreateJobRequestBodyDto(), {
      locationId: 'location-1',
      jobType: 'Service',
      category: 'General',
      origin: 'Inbound phone call',
      summary: 'No heat',
      timeWindowLabel: 'Morning'
    });

    expect(messages(await validate(body))).toContain(
      'scheduledDate is required when appointment schedule details are provided.'
    );
  });

  it('requires scheduledDate when a new appointment has only a technician', async () => {
    const body = Object.assign(new CreateAppointmentRequestBodyDto(), {
      technicianId: 'tech-1'
    });

    expect(messages(await validate(body))).toContain(
      'scheduledDate is required when appointment schedule details are provided.'
    );
  });

  it('allows dated appointment creation with schedule details', async () => {
    const body = Object.assign(new CreateAppointmentRequestBodyDto(), {
      scheduledDate: '2026-06-03',
      timeWindowLabel: 'Morning',
      technicianId: 'tech-1'
    });

    expect(await validate(body)).toHaveLength(0);
  });
});
