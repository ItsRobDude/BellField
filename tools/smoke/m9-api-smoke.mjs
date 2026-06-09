import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const timestamp = new Date().toISOString();
const runId = timestamp.replace(/[:.]/g, '-');
const tag = `m9-smoke-${runId}`;
const apiBaseUrl = normalizeBaseUrl(
  getArgValue('--api-base-url') || process.env.BELLFIELD_API_BASE_URL || 'http://localhost:3001'
);
const allowNonLocal = process.argv.includes('--allow-non-local');
const evidenceDir =
  getArgValue('--evidence-dir') ||
  process.env.BELLFIELD_SMOKE_ARTIFACT_DIR ||
  path.join('artifacts', 'validation', runId);
const evidencePath = path.join(evidenceDir, 'm9-api-smoke.json');

const evidence = {
  name: 'M9 inventory/purchasing/job-costing API smoke',
  startedAt: timestamp,
  apiBaseUrl,
  tag,
  steps: [],
  checks: [],
  created: {}
};

let sessionToken = '';

try {
  assertLocalTarget(apiBaseUrl);
  await request('GET', '/health', undefined, [200], { auth: false });

  const login = await request(
    'POST',
    '/identity/auth/login',
    {
      email: process.env.BELLFIELD_SMOKE_EMAIL || 'admin@bellfield.local',
      password: process.env.BELLFIELD_SMOKE_PASSWORD || 'bellfield-admin',
      surface: 'office-web',
      deviceLabel: `M9 smoke ${runId}`
    },
    [200, 201],
    { auth: false }
  );
  sessionToken = login.sessionToken;
  evidence.created.sessionEmployee = login.employee?.email;

  const locationId = process.env.BELLFIELD_SMOKE_LOCATION_ID || 'location-parkers-home';
  const job = await request('POST', '/operations/jobs', {
    locationId,
    jobType: 'Validation',
    category: 'Validation',
    origin: 'Local smoke script',
    summary: 'Local M9 API smoke validation',
    workOrderNumber: tag
  });
  evidence.created.jobId = job.id;
  check('created smoke job', job.id && job.status, { id: job.id, status: job.status });

  const partItem = await request('POST', '/operations/inventory/items', {
    sku: `${tag}-part`,
    name: 'Smoke test part',
    kind: 'part',
    unitOfMeasure: 'ea',
    defaultUnitCost: 20,
    description: 'Created by the local M9 smoke runner.'
  });
  const equipmentItem = await request('POST', '/operations/inventory/items', {
    sku: `${tag}-equipment`,
    name: 'Smoke test equipment',
    kind: 'equipment',
    unitOfMeasure: 'ea',
    defaultUnitCost: 1800,
    description: 'Created by the local M9 smoke runner.'
  });
  const warehouse = await request('POST', '/operations/inventory/locations', {
    name: 'Smoke test warehouse',
    kind: 'warehouse'
  });
  const truck = await request('POST', '/operations/inventory/locations', {
    name: 'Smoke test truck',
    kind: 'truck',
    assignedEmployeeId: 'employee-technician-1'
  });
  evidence.created.partItemId = partItem.item.id;
  evidence.created.equipmentItemId = equipmentItem.item.id;
  evidence.created.warehouseLocationId = warehouse.location.id;
  evidence.created.truckLocationId = truck.location.id;

  await request('POST', '/operations/inventory/adjustments', {
    itemId: partItem.item.id,
    locationId: warehouse.location.id,
    quantityDelta: 6,
    unitCost: 20,
    note: tag
  });
  await request('POST', '/operations/inventory/transfers', {
    itemId: partItem.item.id,
    fromLocationId: warehouse.location.id,
    toLocationId: truck.location.id,
    quantity: 2,
    note: tag
  });
  await request('POST', '/operations/inventory/issues', {
    itemId: partItem.item.id,
    locationId: truck.location.id,
    jobId: job.id,
    quantity: 1,
    note: tag
  });

  const labor = await request('POST', `/operations/jobs/${job.id}/labor`, {
    description: 'Smoke test labor',
    hours: 2,
    ratePerHour: 100
  });
  const expense = await request('POST', `/operations/jobs/${job.id}/expenses`, {
    description: 'Smoke test permit',
    amount: 50
  });
  evidence.created.laborEventId = labor.event.id;
  evidence.created.expenseEventId = expense.event.id;

  const inventoryPo = await createOrderAndReceivePo({
    vendorName: 'Smoke test inventory vendor',
    destinationInventoryLocationId: warehouse.location.id,
    lines: [
      {
        kind: 'part',
        itemId: partItem.item.id,
        description: 'Smoke test replenishment',
        quantity: 3,
        expectedUnitCost: 30
      }
    ]
  });
  evidence.created.inventoryPurchaseOrderId = inventoryPo.id;

  const jobPo = await createOrderAndReceivePo({
    vendorName: 'Smoke test equipment vendor',
    destinationCustomerLocationId: locationId,
    jobId: job.id,
    lines: [
      {
        kind: 'equipment',
        itemId: equipmentItem.item.id,
        description: 'Smoke test furnace',
        quantity: 1,
        expectedUnitCost: 1800,
        equipmentType: 'Furnace',
        equipmentBrand: 'Carrier',
        equipmentModel: '59TP6',
        equipmentSerial: `${tag}-SN`
      }
    ]
  });
  evidence.created.jobPurchaseOrderId = jobPo.id;

  const pendingReceivePo = await createAndOrderPo({
    vendorName: 'Smoke test pending vendor',
    destinationCustomerLocationId: locationId,
    jobId: job.id,
    lines: [
      {
        kind: 'part',
        itemId: partItem.item.id,
        description: 'Smoke test receive-after-finalization guard',
        quantity: 1,
        expectedUnitCost: 12
      }
    ]
  });
  evidence.created.pendingReceivePurchaseOrderId = pendingReceivePo.id;

  const costingBefore = await request('GET', `/operations/jobs/${job.id}/costing`);
  const live = costingBefore.costing.live;
  check('live cost includes material, labor, and expense', live.materialCost >= 1820, live);
  check('labor cost posted', live.laborCost >= 200, live);
  check('expense cost posted', live.expenseCost >= 50, live);

  const completed = await request('PATCH', `/operations/jobs/${job.id}/status`, {
    status: 'completed'
  });
  check('job completed', completed.status === 'completed', { status: completed.status });

  const costingAfter = await request('GET', `/operations/jobs/${job.id}/costing`);
  check('costing finalized after completion', costingAfter.costing.isFinalized === true, {
    isFinalized: costingAfter.costing.isFinalized,
    finalized: costingAfter.costing.finalized
  });

  await expectStatus('POST', `/operations/jobs/${job.id}/labor`, {
    description: 'Smoke test rejected labor',
    hours: 1,
    ratePerHour: 100
  });
  await expectStatus('POST', `/operations/jobs/${job.id}/expenses`, {
    description: 'Smoke test rejected expense',
    amount: 10
  });
  await expectStatus('POST', `/operations/jobs/${job.id}/cost-events/${labor.event.id}/reverse`, {
    reason: `${tag} rejected reversal`
  });
  await expectStatus('POST', '/operations/inventory/issues', {
    itemId: partItem.item.id,
    locationId: truck.location.id,
    jobId: job.id,
    quantity: 1,
    note: `${tag} rejected issue`
  });
  await expectStatus('POST', `/operations/purchase-orders/${pendingReceivePo.id}/receive`, {
    note: `${tag} rejected receipt`
  });

  evidence.completedAt = new Date().toISOString();
  evidence.status = 'passed';
  await writeEvidence();
  console.log(`M9 API smoke passed. Evidence: ${evidencePath}`);
} catch (error) {
  evidence.completedAt = new Date().toISOString();
  evidence.status = 'failed';
  evidence.error = error instanceof Error ? error.message : String(error);
  await writeEvidence();
  console.error(`M9 API smoke failed. Evidence: ${evidencePath}`);
  console.error(evidence.error);
  process.exit(1);
}

async function createAndOrderPo(body) {
  const created = await request('POST', '/operations/purchase-orders', body);
  const ordered = await request(
    'POST',
    `/operations/purchase-orders/${created.purchaseOrder.id}/order`
  );
  check('purchase order ordered', ordered.purchaseOrder.status === 'ordered', {
    id: ordered.purchaseOrder.id,
    status: ordered.purchaseOrder.status
  });
  return ordered.purchaseOrder;
}

async function createOrderAndReceivePo(body) {
  const ordered = await createAndOrderPo(body);
  const received = await request('POST', `/operations/purchase-orders/${ordered.id}/receive`, {
    note: tag
  });
  check('purchase order received', received.purchaseOrder.status === 'received', {
    id: received.purchaseOrder.id,
    status: received.purchaseOrder.status
  });
  return received.purchaseOrder;
}

async function request(method, route, body, expectedStatuses = [200, 201], options = {}) {
  const url = new URL(route, `${apiBaseUrl}/`);
  const headers = {};
  if (body !== undefined) {
    headers['content-type'] = 'application/json';
  }
  if (options.auth !== false) {
    headers.authorization = `Bearer ${sessionToken}`;
  }

  let response;
  let parsed;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    parsed = await parseResponse(response);
  } catch (error) {
    evidence.steps.push({
      name: `${method} ${route}`,
      status: 'failed',
      error: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }

  evidence.steps.push({
    name: `${method} ${route}`,
    status: expectedStatuses.includes(response.status) ? 'passed' : 'failed',
    httpStatus: response.status
  });

  if (!expectedStatuses.includes(response.status)) {
    throw new Error(
      `${method} ${route} expected ${expectedStatuses.join('/')} but got ${response.status}: ${JSON.stringify(parsed)}`
    );
  }

  return parsed;
}

async function expectStatus(method, route, body, status = 409) {
  const result = await request(method, route, body, [status]);
  evidence.checks.push({
    name: `${method} ${route} rejected with ${status}`,
    status: 'passed'
  });
  return result;
}

function check(name, condition, details) {
  evidence.checks.push({
    name,
    status: condition ? 'passed' : 'failed',
    details
  });
  if (!condition) {
    throw new Error(`Smoke check failed: ${name}`);
  }
}

async function parseResponse(response) {
  const text = await response.text();
  if (!text) {
    return undefined;
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function writeEvidence() {
  await mkdir(evidenceDir, { recursive: true });
  await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
}

function normalizeBaseUrl(value) {
  return value.trim().replace(/\/+$/, '');
}

function assertLocalTarget(value) {
  const url = new URL(value);
  const localHosts = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
  if (!localHosts.has(url.hostname) && !allowNonLocal) {
    throw new Error(
      `Refusing to run a mutating smoke test against non-local API target ${value}. Pass --allow-non-local only for an intentionally disposable environment.`
    );
  }
}

function getArgValue(name) {
  const prefix = `${name}=`;
  const arg = process.argv.find((entry) => entry.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : undefined;
}
