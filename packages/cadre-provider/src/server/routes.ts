/**
 * HTTP routes for the Provider API.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import debug from 'debug';
import type { ContainerService } from '../service/container-service.js';
import type { BillingService } from '../service/billing-service.js';
import type { CreateContainerRequest } from '../types.js';

const log = debug('cadre:provider:routes');

/** Route context with services */
export interface RouteContext {
  containerService: ContainerService;
  billingService: BillingService;
  basePath: string;
}

/** Customer identity from authentication */
export interface CustomerIdentity {
  customerId: string;
  permissions: string[];
}

/** Helper for error responses */
function errorResponse(reply: FastifyReply, code: string, message: string, status = 400) {
  return reply.status(status).send({
    ok: false,
    error: { code, message },
  });
}

/** Register all routes */
export function registerRoutes(app: FastifyInstance, ctx: RouteContext): void {
  const { basePath, containerService, billingService } = ctx;

  // GET /status - Health check
  app.get(`${basePath}/status`, async (_request, reply) => {
    log('GET %s/status', basePath);
    return reply.send({ ok: true, service: 'cadre-provider', version: '0.0.1' });
  });

  // POST /containers - Create a new container
  app.post(`${basePath}/containers`, async (request, reply) => {
    log('POST %s/containers', basePath);

    const customer = (request as any).customer as CustomerIdentity | undefined;
    if (!customer) {
      return errorResponse(reply, 'UNAUTHORIZED', 'Authentication required', 401);
    }

    const body = request.body as Partial<CreateContainerRequest>;

    // Validate required fields
    if (!body.partyId) {
      return errorResponse(reply, 'INVALID_REQUEST', 'partyId is required');
    }
    if (!body.bootstrapNodes?.length) {
      return errorResponse(reply, 'INVALID_REQUEST', 'bootstrapNodes is required');
    }

    // Check quota
    const canCreate = await billingService.canCreateContainer(customer.customerId);
    if (!canCreate.allowed) {
      return errorResponse(reply, 'QUOTA_EXCEEDED', canCreate.reason ?? 'Cannot create more containers', 403);
    }

    const createRequest: CreateContainerRequest = {
      customerId: customer.customerId,
      partyId: body.partyId,
      bootstrapNodes: body.bootstrapNodes,
      profile: body.profile ?? 'storage',
      resources: body.resources,
      strandFilter: body.strandFilter,
      tags: body.tags,
    };

    const container = await containerService.createContainer(createRequest);

    return reply.status(201).send({
      ok: true,
      data: { container },
    });
  });

  // GET /containers - List containers
  app.get(`${basePath}/containers`, async (request, reply) => {
    log('GET %s/containers', basePath);

    const customer = (request as any).customer as CustomerIdentity | undefined;
    if (!customer) {
      return errorResponse(reply, 'UNAUTHORIZED', 'Authentication required', 401);
    }

    const containers = await containerService.listContainers(customer.customerId);

    return reply.send({
      ok: true,
      data: { containers },
    });
  });

  // GET /containers/:id - Get container status
  app.get(`${basePath}/containers/:id`, async (request, reply) => {
    const { id } = request.params as { id: string };
    log('GET %s/containers/%s', basePath, id);

    const customer = (request as any).customer as CustomerIdentity | undefined;
    if (!customer) {
      return errorResponse(reply, 'UNAUTHORIZED', 'Authentication required', 401);
    }

    const status = await containerService.getContainerStatus(id);
    if (!status) {
      return errorResponse(reply, 'NOT_FOUND', 'Container not found', 404);
    }

    // Verify ownership
    if (status.container.customerId !== customer.customerId) {
      return errorResponse(reply, 'FORBIDDEN', 'Access denied', 403);
    }

    return reply.send({
      ok: true,
      data: status,
    });
  });

  // DELETE /containers/:id - Terminate container
  app.delete(`${basePath}/containers/:id`, async (request, reply) => {
    const { id } = request.params as { id: string };
    log('DELETE %s/containers/%s', basePath, id);

    const customer = (request as any).customer as CustomerIdentity | undefined;
    if (!customer) {
      return errorResponse(reply, 'UNAUTHORIZED', 'Authentication required', 401);
    }

    const container = await containerService.getContainer(id);
    if (!container) {
      return errorResponse(reply, 'NOT_FOUND', 'Container not found', 404);
    }

    // Verify ownership
    if (container.customerId !== customer.customerId) {
      return errorResponse(reply, 'FORBIDDEN', 'Access denied', 403);
    }

    const success = await containerService.terminateContainer(id);

    return reply.send({
      ok: success,
      message: success ? 'Container terminated' : 'Termination failed',
    });
  });

  // GET /billing/plans - List available plans
  app.get(`${basePath}/billing/plans`, async (_request, reply) => {
    log('GET %s/billing/plans', basePath);
    const plans = billingService.listPlans();
    return reply.send({ ok: true, data: { plans } });
  });

  // GET /billing/status - Get customer billing status
  app.get(`${basePath}/billing/status`, async (request, reply) => {
    log('GET %s/billing/status', basePath);

    const customer = (request as any).customer as CustomerIdentity | undefined;
    if (!customer) {
      return errorResponse(reply, 'UNAUTHORIZED', 'Authentication required', 401);
    }

    const billing = await billingService.getCustomerBilling(customer.customerId);
    return reply.send({ ok: true, data: { billing } });
  });

  log('Routes registered at %s', basePath);
}

